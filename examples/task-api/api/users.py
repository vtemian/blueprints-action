"""
FastAPI User Management and Authentication API Module

This module provides comprehensive user management endpoints including registration,
authentication, profile management, and password operations with proper security
measures and validation.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field, validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
import re

# Import custom modules
from models.user import User
from core.auth import (
    hash_password, 
    verify_password, 
    create_access_token, 
    decode_access_token
)
from core.database import get_db_session

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/api/users", tags=["users"])

# Security scheme
security = HTTPBearer()

# Constants
PASSWORD_MIN_LENGTH = 8
TOKEN_EXPIRE_HOURS = 24


# Pydantic Models
class UserRegisterRequest(BaseModel):
    """Request model for user registration"""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=PASSWORD_MIN_LENGTH, description="User's password")
    name: str = Field(..., min_length=1, max_length=100, description="User's full name")
    
    @validator('password')
    def validate_password_complexity(cls, v):
        """Validate password complexity requirements"""
        if len(v) < PASSWORD_MIN_LENGTH:
            raise ValueError(f'Password must be at least {PASSWORD_MIN_LENGTH} characters long')
        
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        
        return v
    
    @validator('name')
    def validate_name(cls, v):
        """Sanitize and validate name field"""
        # Strip whitespace and sanitize
        v = v.strip()
        if not v:
            raise ValueError('Name cannot be empty')
        
        # Remove any potentially harmful characters
        v = re.sub(r'[<>"\']', '', v)
        return v


class UserLoginRequest(BaseModel):
    """Request model for user login"""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")


class UserUpdateRequest(BaseModel):
    """Request model for user profile update"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="User's full name")
    email: Optional[EmailStr] = Field(None, description="User's email address")
    current_password: Optional[str] = Field(None, description="Current password for email changes")
    
    @validator('name')
    def validate_name(cls, v):
        """Sanitize and validate name field"""
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError('Name cannot be empty')
            v = re.sub(r'[<>"\']', '', v)
        return v


class ChangePasswordRequest(BaseModel):
    """Request model for password change"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=PASSWORD_MIN_LENGTH, description="New password")
    
    @validator('new_password')
    def validate_password_complexity(cls, v):
        """Validate password complexity requirements"""
        if len(v) < PASSWORD_MIN_LENGTH:
            raise ValueError(f'Password must be at least {PASSWORD_MIN_LENGTH} characters long')
        
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        
        return v


class UserResponse(BaseModel):
    """Response model for user data (excludes password)"""
    id: int
    email: str
    name: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]
    
    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    """Response model for authentication endpoints"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class MessageResponse(BaseModel):
    """Generic message response model"""
    message: str


# Dependency Functions
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    """
    Dependency to get current authenticated user from JWT token
    
    Args:
        credentials: HTTP Bearer token credentials
        db: Database session
        
    Returns:
        User: Current authenticated user
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    try:
        # Decode JWT token
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
        
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user from database
        user = await db.get(User, int(user_id))
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Inactive user",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user
        
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# Route Handlers
@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserRegisterRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Register a new user account
    
    Creates a new user with hashed password and returns JWT token for immediate authentication.
    
    Args:
        user_data: User registration data including email, password, and name
        db: Database session dependency
        
    Returns:
        AuthResponse: JWT token and user information
        
    Raises:
        HTTPException: 409 if email already exists, 500 for database errors
        
    Example:
        ```json
        {
            "email": "user@example.com",
            "password": "SecurePass123!",
            "name": "John Doe"
        }
        ```
    """
    try:
        logger.info(f"Attempting to register user with email: {user_data.email}")
        
        # Hash password
        hashed_password = hash_password(user_data.password)
        
        # Create user instance
        user = User(
            email=user_data.email.lower().strip(),
            password_hash=hashed_password,
            name=user_data.name.strip(),
            is_active=True,
            created_at=datetime.utcnow()
        )
        
        # Add to database
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        # Generate JWT token
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(hours=TOKEN_EXPIRE_HOURS)
        )
        
        logger.info(f"Successfully registered user: {user.email}")
        
        return AuthResponse(
            access_token=access_token,
            expires_in=TOKEN_EXPIRE_HOURS * 3600,
            user=UserResponse.from_orm(user)
        )
        
    except IntegrityError:
        await db.rollback()
        logger.warning(f"Registration failed - email already exists: {user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address already registered"
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during registration"
        )


@router.post("/login", response_model=AuthResponse)
async def login_user(
    login_data: UserLoginRequest,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Authenticate user and return JWT token
    
    Verifies user credentials and updates last login timestamp.
    
    Args:
        login_data: User login credentials
        db: Database session dependency
        
    Returns:
        AuthResponse: JWT token and user information
        
    Raises:
        HTTPException: 401 for invalid credentials, 500 for database errors
        
    Example:
        ```json
        {
            "email": "user@example.com",
            "password": "SecurePass123!"
        }
        ```
    """
    try:
        logger.info(f"Login attempt for email: {login_data.email}")
        
        # Find user by email
        from sqlalchemy import select
        result = await db.execute(
            select(User).where(User.email == login_data.email.lower().strip())
        )
        user = result.scalar_one_or_none()
        
        if not user or not user.is_active:
            logger.warning(f"Login failed - user not found or inactive: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Verify password
        if not verify_password(login_data.password, user.password_hash):
            logger.warning(f"Login failed - invalid password: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Update last login
        user.last_login = datetime.utcnow()
        await db.commit()
        await db.refresh(user)
        
        # Generate JWT token
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(hours=TOKEN_EXPIRE_HOURS)
        )
        
        logger.info(f"Successful login for user: {user.email}")
        
        return AuthResponse(
            access_token=access_token,
            expires_in=TOKEN_EXPIRE_HOURS * 3600,
            user=UserResponse.from_orm(user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during login"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """
    Get current user's profile information
    
    Returns the authenticated user's profile data excluding sensitive information.
    
    Args:
        current_user: Current authenticated user from dependency
        
    Returns:
        UserResponse: User profile information
        
    Example Response:
        ```json
        {
            "id": 1,
            "email": "user@example.com",
            "name": "John Doe",
            "is_active": true,
            "created_at": "2023-01-01T00:00:00Z",
            "last_login": "2023-01-02T10:30:00Z"
        }
        ```
    """
    logger.info(f"Profile request for user: {current_user.email}")
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    update_data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Update current user's profile information
    
    Allows updating name and email. Email changes require current password confirmation.
    
    Args:
        update_data: Profile update data
        current_user: Current authenticated user from dependency
        db: Database session dependency
        
    Returns:
        UserResponse: Updated user profile information
        
    Raises:
        HTTPException: 400 for validation errors, 409 for email conflicts, 500 for database errors
        
    Example:
        ```json
        {
            "name": "John Smith",
            "email": "john.smith@example.com",
            "current_password": "SecurePass123!"
        }
        ```
    """
    try:
        logger.info(f"Profile update request for user: {current_user.email}")
        
        # Check if email is being changed and validate password
        if update_data.email and update_data.email.lower() != current_user.email.lower():
            if not update_data.current_password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password required for email changes"
                )
            
            if not verify_password(update_data.current_password, current_user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid current password"
                )
            
            # Check if new email already exists
            from sqlalchemy import select
            result = await db.execute(
                select(User).where(
                    User.email == update_data.email.lower().strip(),
                    User.id != current_user.id
                )
            )
            if result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email address already in use"
                )
            
            current_user.email = update_data.email.lower().strip()
        
        # Update name if provided
        if update_data.name:
            current_user.name = update_data.name.strip()
        
        await db.commit()
        await db.refresh(current_user)
        
        logger.info(f"Profile updated successfully for user: {current_user.email}")
        
        return UserResponse.from_orm(current_user)
        
    except HTTPException:
        raise
    except IntegrityError:
        await db.rollback()
        raise HTTP