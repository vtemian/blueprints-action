"""
User Management and Authentication API Module

This module provides comprehensive user management endpoints including registration,
authentication, profile management, and password operations with enterprise-grade
security features.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field, validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
import bcrypt
import jwt
from email_validator import validate_email, EmailNotValidError

# Custom module imports
from models.user import User, UserCreate, UserUpdate
from core.auth import (
    create_access_token, 
    verify_token, 
    get_password_hash, 
    verify_password,
    get_current_user
)
from core.database import get_db_session

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize router and security
router = APIRouter(prefix="/api/users", tags=["users"])
security = HTTPBearer()

# Pydantic Models for Request/Response

class UserRegistrationRequest(BaseModel):
    """User registration request model with validation"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (minimum 8 characters)")
    first_name: str = Field(..., min_length=1, max_length=50, description="User first name")
    last_name: str = Field(..., min_length=1, max_length=50, description="User last name")
    
    @validator('password')
    def validate_password_strength(cls, v):
        """Validate password meets security requirements"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v
    
    @validator('email')
    def validate_email_format(cls, v):
        """Additional email validation"""
        try:
            validate_email(v)
        except EmailNotValidError:
            raise ValueError('Invalid email format')
        return v.lower().strip()

class UserLoginRequest(BaseModel):
    """User login request model"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")

class UserProfileResponse(BaseModel):
    """User profile response model (excludes sensitive data)"""
    id: int
    email: str
    first_name: str
    last_name: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]
    
    class Config:
        from_attributes = True

class UserProfileUpdateRequest(BaseModel):
    """User profile update request model"""
    email: Optional[EmailStr] = Field(None, description="New email address")
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    
    @validator('email')
    def validate_email_format(cls, v):
        if v is not None:
            try:
                validate_email(v)
            except EmailNotValidError:
                raise ValueError('Invalid email format')
            return v.lower().strip()
        return v

class PasswordChangeRequest(BaseModel):
    """Password change request model"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")
    
    @validator('new_password')
    def validate_new_password_strength(cls, v):
        """Validate new password meets security requirements"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

class AuthResponse(BaseModel):
    """Authentication response model"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfileResponse

class MessageResponse(BaseModel):
    """Generic message response model"""
    message: str
    detail: Optional[str] = None

class ErrorResponse(BaseModel):
    """Error response model"""
    error: str
    detail: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# Utility Functions

async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """Retrieve user by email address"""
    try:
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()
    except SQLAlchemyError as e:
        logger.error(f"Database error retrieving user by email: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database operation failed"
        )

async def create_user_in_db(db: AsyncSession, user_data: UserRegistrationRequest) -> User:
    """Create new user in database"""
    try:
        hashed_password = get_password_hash(user_data.password)
        
        new_user = User(
            email=user_data.email.lower(),
            password_hash=hashed_password,
            first_name=user_data.first_name.strip(),
            last_name=user_data.last_name.strip(),
            is_active=True,
            created_at=datetime.utcnow()
        )
        
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        logger.info(f"New user created: {new_user.email}")
        return new_user
        
    except IntegrityError:
        await db.rollback()
        logger.warning(f"Attempted duplicate user registration: {user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists"
        )
    except SQLAlchemyError as e:
        await db.rollback()
        logger.error(f"Database error creating user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account"
        )

# API Endpoints

@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "User successfully registered"},
        400: {"model": ErrorResponse, "description": "Invalid input data"},
        409: {"model": ErrorResponse, "description": "Email already exists"},
        500: {"model": ErrorResponse, "description": "Internal server error"}
    }
)
async def register_user(
    user_data: UserRegistrationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session)
) -> AuthResponse:
    """
    Register a new user account with email uniqueness validation.
    
    Creates a new user account with secure password hashing and returns
    an authentication token for immediate login.
    """
    try:
        # Check if user already exists
        existing_user = await get_user_by_email(db, user_data.email)
        if existing_user:
            logger.warning(f"Registration attempt with existing email: {user_data.email}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email address already exists"
            )
        
        # Create new user
        new_user = await create_user_in_db(db, user_data)
        
        # Generate access token
        access_token = create_access_token(data={"sub": str(new_user.id)})
        
        # Log successful registration
        logger.info(f"User registered successfully: {new_user.email} from IP: {request.client.host}")
        
        return AuthResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=3600,  # 1 hour
            user=UserProfileResponse.from_orm(new_user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during registration: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed due to server error"
        )

@router.post(
    "/login",
    response_model=AuthResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Login successful"},
        401: {"model": ErrorResponse, "description": "Invalid credentials"},
        500: {"model": ErrorResponse, "description": "Internal server error"}
    }
)
async def login_user(
    login_data: UserLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session)
) -> AuthResponse:
    """
    Authenticate user and return access token with login tracking.
    
    Validates user credentials and updates last login timestamp.
    """
    try:
        # Retrieve user by email
        user = await get_user_by_email(db, login_data.email)
        
        if not user or not user.is_active:
            logger.warning(f"Login attempt with invalid email: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Verify password
        if not verify_password(login_data.password, user.password_hash):
            logger.warning(f"Failed login attempt for user: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Update last login timestamp
        user.last_login = datetime.utcnow()
        await db.commit()
        
        # Generate access token
        access_token = create_access_token(data={"sub": str(user.id)})
        
        # Log successful login
        logger.info(f"User logged in successfully: {user.email} from IP: {request.client.host}")
        
        return AuthResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=3600,  # 1 hour
            user=UserProfileResponse.from_orm(user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during login: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed due to server error"
        )

@router.get(
    "/me",
    response_model=UserProfileResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Profile retrieved successfully"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "User not found"}
    }
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
) -> UserProfileResponse:
    """
    Retrieve current user's profile information.
    
    Returns user profile data excluding sensitive information like password hash.
    """
    try:
        logger.info(f"Profile accessed by user: {current_user.email}")
        return UserProfileResponse.from_orm(current_user)
        
    except Exception as e:
        logger.error(f"Error retrieving user profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve profile information"
        )

@router.put(
    "/me",
    response_model=UserProfileResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Profile updated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid input data"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        409: {"model": ErrorResponse, "description": "Email already exists"}
    }
)
async def update_user_profile(
    profile_data: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> UserProfileResponse:
    """
    Update current user's profile information with email change confirmation.
    
    Allows updating profile fields with proper validation and email uniqueness check.
    """
    try:
        # Check if email is being changed and if it's already taken
        if profile_data.email and profile_data.email != current_user.email:
            existing_user = await get_user_by_email(db, profile_data.email)
            if existing_user:
                logger.warning(f"Profile update attempt with existing email: {profile_data.email}")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email address is already in use"
                )
        
        # Update user fields
        update_data = profile_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                setattr(current_user, field, value)
        
        # Save changes
        await db.commit()
        await db.refresh(current_user)
        
        logger.info(f"Profile updated for user: {current_user.email}")
        
        return UserProfileResponse.from_orm(current_user)
        
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        await db.rollback()
        logger.error(f"Database error updating profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )
    except Exception as e:
        logger.error(f"Unexpected error updating profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Profile update failed due to server error"
        )

@router.post(
    "/change-password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Password changed successfully"},
        400: {"model": ErrorResponse, "description": "Invalid current password"},
        401: {"model": ErrorResponse, "description": "Authentication required"}
    }
)
async def change_user_password(
    password_data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> MessageResponse:
    """
    Change current user's password with current password verification.
    
    Requires current password verification before allowing password change.
    """
    try:
        # Verify current password
        if not verify_password(password_data.current_