"""
User management and authentication endpoints module.

This module provides comprehensive user management functionality including
registration, authentication, profile management, and password operations.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field, validator
from passlib.context import CryptContext
from jose import JWTError, jwt
import re

from models.user import User
from core.auth import (
    create_access_token, 
    verify_token, 
    get_current_user,
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from core.database import get_db_session

# Router setup
router = APIRouter(prefix="/api/users", tags=["users"])

# Security setup
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Pydantic Schemas

class UserRegisterRequest(BaseModel):
    """Schema for user registration request."""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=8, description="User's password (min 8 characters)")
    name: str = Field(..., min_length=1, max_length=100, description="User's full name")
    
    @validator('password')
    def validate_password(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one number')
        return v
    
    @validator('name')
    def validate_name(cls, v):
        """Validate name format."""
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()


class UserLoginRequest(BaseModel):
    """Schema for user login request."""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")


class UserResponse(BaseModel):
    """Schema for user response (excludes sensitive data)."""
    id: int
    email: str
    name: str
    created_at: datetime
    last_login: Optional[datetime] = None
    is_active: bool = True
    
    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    """Schema for authentication response."""
    user: UserResponse
    access_token: str
    token_type: str = "bearer"
    expires_in: int = ACCESS_TOKEN_EXPIRE_MINUTES * 60


class UserUpdateRequest(BaseModel):
    """Schema for user profile update request."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, description="Required if changing email")
    
    @validator('name')
    def validate_name(cls, v):
        """Validate name format."""
        if v is not None and not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip() if v else v


class ChangePasswordRequest(BaseModel):
    """Schema for password change request."""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")
    
    @validator('new_password')
    def validate_new_password(cls, v):
        """Validate new password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one number')
        return v


class MessageResponse(BaseModel):
    """Schema for simple message responses."""
    message: str


# Utility Functions

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


async def get_user_by_email(email: str, db_session) -> Optional[User]:
    """Get user by email from database."""
    try:
        # Assuming User model has a method to find by email
        return await User.find_by_email(db_session, email)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


async def create_user_in_db(user_data: dict, db_session) -> User:
    """Create a new user in the database."""
    try:
        user = User(**user_data)
        await user.save(db_session)
        return user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user"
        )


# Authentication Dependency

async def get_current_active_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_session = Depends(get_db_session)
) -> User:
    """Get current authenticated user."""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        user = await User.find_by_id(db_session, user_id)
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        return user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


# API Endpoints

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_request: UserRegisterRequest,
    db_session = Depends(get_db_session)
):
    """
    Register a new user.
    
    Creates a new user account with the provided email, password, and name.
    Returns user information and authentication token.
    
    - **email**: Valid email address (must be unique)
    - **password**: Password with minimum 8 characters, containing letters and numbers
    - **name**: User's full name
    """
    try:
        # Check if user already exists
        existing_user = await get_user_by_email(user_request.email, db_session)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )
        
        # Hash password
        hashed_password = hash_password(user_request.password)
        
        # Create user data
        user_data = {
            "email": user_request.email,
            "password_hash": hashed_password,
            "name": user_request.name,
            "created_at": datetime.utcnow(),
            "is_active": True
        }
        
        # Create user in database
        user = await create_user_in_db(user_data, db_session)
        
        # Generate access token
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return AuthResponse(
            user=UserResponse.from_orm(user),
            access_token=access_token,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )


@router.post("/login", response_model=AuthResponse)
async def login_user(
    login_request: UserLoginRequest,
    db_session = Depends(get_db_session)
):
    """
    Authenticate user and return access token.
    
    Validates user credentials and returns user information with authentication token.
    Updates the user's last login timestamp.
    
    - **email**: User's registered email address
    - **password**: User's password
    """
    try:
        # Get user by email
        user = await get_user_by_email(login_request.email, db_session)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Verify password
        if not verify_password(login_request.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Check if user is active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is deactivated"
            )
        
        # Update last login
        user.last_login = datetime.utcnow()
        await user.save(db_session)
        
        # Generate access token
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return AuthResponse(
            user=UserResponse.from_orm(user),
            access_token=access_token,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current user profile.
    
    Returns the authenticated user's profile information.
    Requires valid authentication token.
    """
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    update_request: UserUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db_session = Depends(get_db_session)
):
    """
    Update current user profile.
    
    Updates the authenticated user's profile information.
    If changing email, password confirmation is required.
    
    - **name**: New name (optional)
    - **email**: New email address (optional, requires password confirmation)
    - **password**: Current password (required if changing email)
    """
    try:
        update_data = {}
        
        # Update name if provided
        if update_request.name is not None:
            update_data["name"] = update_request.name
        
        # Update email if provided
        if update_request.email is not None:
            # Require password confirmation for email change
            if not update_request.password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password confirmation required for email change"
                )
            
            # Verify current password
            if not verify_password(update_request.password, current_user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid password"
                )
            
            # Check if new email is already taken
            if update_request.email != current_user.email:
                existing_user = await get_user_by_email(update_request.email, db_session)
                if existing_user:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Email already in use"
                    )
                update_data["email"] = update_request.email
        
        # Update user if there are changes
        if update_data:
            for key, value in update_data.items():
                setattr(current_user, key, value)
            await current_user.save(db_session)
        
        return UserResponse.from_orm(current_user)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Profile update failed"
        )


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    password_request: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db_session = Depends(get_db_session)
):
    """
    Change user password.
    
    Changes the authenticated user's password after verifying the current password.
    
    - **current_password**: User's current password
    - **new_password**: New password (min 8 characters, must contain letters and numbers)
    """
    try:
        # Verify current password
        if not verify_password(password_request.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        # Check if new password is different from current
        if verify_password(password_request.new_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from current password"
            )
        
        # Hash new password and update
        new_password_hash = hash_password(password_request.new_password)
        current_user.password_hash = new_password_hash
        await current_user.save(db_session)
        
        return MessageResponse(message="Password changed successfully")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password change failed"
        )


# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check endpoint for the users module."""
    return {"status": "healthy", "module": "users", "timestamp": datetime.utcnow()}


# Export router for main application
__all__ = ["router"]