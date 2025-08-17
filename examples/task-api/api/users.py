"""
FastAPI User Management and Authentication API Module

This module provides comprehensive user management endpoints including
registration, authentication, profile management, and password changes.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer
from pydantic import BaseModel, EmailStr, Field, validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from models.user import User
from core.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
    verify_token
)
from core.database import get_db

# Initialize router
router = APIRouter(
    prefix="/api/users",
    tags=["users"],
    responses={404: {"description": "Not found"}},
)

# Security scheme
security = HTTPBearer()

# Pydantic Models for Request/Response Schemas

class UserRegisterRequest(BaseModel):
    """Schema for user registration request."""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=8, description="User's password (minimum 8 characters)")
    name: str = Field(..., min_length=1, max_length=100, description="User's full name")
    
    @validator('password')
    def validate_password(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        if not any(c.isalpha() for c in v):
            raise ValueError('Password must contain at least one letter')
        return v
    
    @validator('name')
    def validate_name(cls, v):
        """Validate and sanitize name."""
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
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserAuthResponse(BaseModel):
    """Schema for authentication response."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserUpdateRequest(BaseModel):
    """Schema for user profile update request."""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="User's full name")
    email: Optional[EmailStr] = Field(None, description="User's email address")
    current_password: Optional[str] = Field(None, description="Current password (required for email change)")
    
    @validator('name')
    def validate_name(cls, v):
        """Validate and sanitize name."""
        if v is not None:
            return v.strip()
        return v
    
    @validator('email')
    def validate_email_change(cls, v, values):
        """Validate email change requires password confirmation."""
        if v is not None and 'current_password' not in values:
            raise ValueError('Current password is required when changing email')
        return v


class ChangePasswordRequest(BaseModel):
    """Schema for password change request."""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")
    confirm_password: str = Field(..., description="Confirm new password")
    
    @validator('new_password')
    def validate_new_password(cls, v):
        """Validate new password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        if not any(c.isalpha() for c in v):
            raise ValueError('Password must contain at least one letter')
        return v
    
    @validator('confirm_password')
    def validate_password_match(cls, v, values):
        """Validate password confirmation matches."""
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Password confirmation does not match')
        return v


class ErrorResponse(BaseModel):
    """Schema for error responses."""
    detail: str
    error_code: Optional[str] = None


# API Endpoints

@router.post(
    "/register",
    response_model=UserAuthResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        409: {"model": ErrorResponse, "description": "Email already registered"},
        500: {"model": ErrorResponse, "description": "Internal server error"}
    }
)
async def register_user(
    user_data: UserRegisterRequest,
    db: Session = Depends(get_db)
) -> UserAuthResponse:
    """
    Register a new user account.
    
    Creates a new user with hashed password, validates email uniqueness,
    and returns user data with JWT access token.
    
    Args:
        user_data: User registration data (email, password, name)
        db: Database session dependency
        
    Returns:
        UserAuthResponse: User data and JWT access token
        
    Raises:
        HTTPException: 409 if email already exists, 400 for validation errors
    """
    try:
        # Check if email already exists
        existing_user = db.query(User).filter(User.email == user_data.email.lower()).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email address is already registered"
            )
        
        # Hash password
        hashed_password = hash_password(user_data.password)
        
        # Create new user
        new_user = User(
            email=user_data.email.lower(),
            password_hash=hashed_password,
            name=user_data.name,
            is_active=True,
            created_at=datetime.utcnow()
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        # Generate JWT token
        access_token = create_access_token(data={"sub": str(new_user.id)})
        
        return UserAuthResponse(
            access_token=access_token,
            user=UserResponse.from_orm(new_user)
        )
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already registered"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account"
        )


@router.post(
    "/login",
    response_model=UserAuthResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid credentials"},
        403: {"model": ErrorResponse, "description": "Account disabled"},
        500: {"model": ErrorResponse, "description": "Internal server error"}
    }
)
async def login_user(
    login_data: UserLoginRequest,
    db: Session = Depends(get_db)
) -> UserAuthResponse:
    """
    Authenticate user and return JWT token.
    
    Verifies user credentials, updates last login timestamp,
    and returns user data with JWT access token.
    
    Args:
        login_data: User login credentials (email, password)
        db: Database session dependency
        
    Returns:
        UserAuthResponse: User data and JWT access token
        
    Raises:
        HTTPException: 401 for invalid credentials, 403 for disabled accounts
    """
    try:
        # Find user by email
        user = db.query(User).filter(User.email == login_data.email.lower()).first()
        
        if not user or not verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled"
            )
        
        # Update last login timestamp
        user.last_login = datetime.utcnow()
        db.commit()
        
        # Generate JWT token
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return UserAuthResponse(
            access_token=access_token,
            user=UserResponse.from_orm(user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )


@router.get(
    "/me",
    response_model=UserResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Authentication required"},
        404: {"model": ErrorResponse, "description": "User not found"}
    }
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
) -> UserResponse:
    """
    Get current authenticated user's profile.
    
    Returns the profile information of the currently authenticated user.
    Password hash and other sensitive data are excluded from the response.
    
    Args:
        current_user: Current authenticated user from JWT token
        
    Returns:
        UserResponse: Current user's profile data
    """
    return UserResponse.from_orm(current_user)


@router.put(
    "/me",
    response_model=UserResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        409: {"model": ErrorResponse, "description": "Email already exists"},
        500: {"model": ErrorResponse, "description": "Internal server error"}
    }
)
async def update_user_profile(
    update_data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> UserResponse:
    """
    Update current user's profile information.
    
    Allows updating name and email. Email changes require current password
    confirmation for security.
    
    Args:
        update_data: Profile update data
        current_user: Current authenticated user
        db: Database session dependency
        
    Returns:
        UserResponse: Updated user profile data
        
    Raises:
        HTTPException: 400 for validation errors, 409 for email conflicts
    """
    try:
        updated = False
        
        # Update name if provided
        if update_data.name is not None:
            current_user.name = update_data.name
            updated = True
        
        # Update email if provided (requires password confirmation)
        if update_data.email is not None:
            if not update_data.current_password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is required to change email"
                )
            
            # Verify current password
            if not verify_password(update_data.current_password, current_user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is incorrect"
                )
            
            # Check if new email already exists
            existing_user = db.query(User).filter(
                User.email == update_data.email.lower(),
                User.id != current_user.id
            ).first()
            
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email address is already in use"
                )
            
            current_user.email = update_data.email.lower()
            updated = True
        
        if updated:
            db.commit()
            db.refresh(current_user)
        
        return UserResponse.from_orm(current_user)
        
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already in use"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )


@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        401: {"model": ErrorResponse, "description": "Authentication required"},
        500: {"model": ErrorResponse, "description": "Internal server error"}
    }
)
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> dict:
    """
    Change user's password.
    
    Requires current password verification and validates new password strength.
    The new password must be different from the current password.
    
    Args:
        password_data: Password change data (current, new, confirm)
        current_user: Current authenticated user
        db: Database session dependency
        
    Returns:
        dict: Success message
        
    Raises:
        HTTPException: 400 for validation errors or incorrect current password
    """
    try:
        # Verify current password
        if not verify_password(password_data.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        # Check if new password is different from current
        if verify_password(password_data.new_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from current password"
            )
        
        # Hash and update new password
        new_password_hash = hash_password(password_data.new_password)
        current_user.password_hash = new_password_hash
        
        db.commit()
        
        return {"message": "Password changed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to change password"
        )


# Health check endpoint for the users module
@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    tags=["health"]
)
async def users_health_check() -> dict:
    """
    Health check endpoint for users module.
    
    Returns:
        dict: Health status information
    """
    return {
        "status": "healthy",
        "module": "users",
        "timestamp": datetime.utcnow().isoformat()
    }