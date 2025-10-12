"""
FastAPI User Management and Authentication API Module

This module provides user registration, authentication, and profile management
endpoints with proper security practices and error handling.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer
from pydantic import BaseModel, EmailStr, Field, validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from core.database import get_db
from models.user import User

# Initialize router and security
router = APIRouter(prefix="/api/users", tags=["users"])
security = HTTPBearer()


# Pydantic Models
class UserRegisterRequest(BaseModel):
    """Request model for user registration"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (minimum 8 characters)")
    name: str = Field(..., min_length=1, max_length=100, description="User full name")

    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v


class UserLoginRequest(BaseModel):
    """Request model for user login"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class UserUpdateRequest(BaseModel):
    """Request model for user profile update"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="User full name")
    email: Optional[EmailStr] = Field(None, description="User email address")
    password: Optional[str] = Field(None, description="Current password (required for email changes)")

    @validator('email')
    def validate_email_with_password(cls, v, values):
        if v is not None and 'password' not in values:
            raise ValueError('Password is required when changing email')
        return v


class ChangePasswordRequest(BaseModel):
    """Request model for password change"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")

    @validator('new_password')
    def validate_new_password(cls, v):
        if len(v) < 8:
            raise ValueError('New password must be at least 8 characters long')
        return v


class UserResponse(BaseModel):
    """Response model for user data (without password)"""
    id: int
    email: str
    name: str
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    """Response model for authentication endpoints"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    """Response model for simple messages"""
    message: str


# Helper Functions
def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email address"""
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, user_data: UserRegisterRequest) -> User:
    """Create a new user in the database"""
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=hashed_password,
        created_at=datetime.utcnow()
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_last_login(db: Session, user: User) -> None:
    """Update user's last login timestamp"""
    user.last_login = datetime.utcnow()
    db.commit()


# API Endpoints
@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Register a new user account
    
    Creates a new user with the provided email, password, and name.
    Returns user information and JWT access token upon successful registration.
    """
    try:
        # Check if user already exists
        existing_user = get_user_by_email(db, user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email address is already registered"
            )
        
        # Create new user
        new_user = create_user(db, user_data)
        
        # Generate access token
        access_token = create_access_token(data={"sub": str(new_user.id)})
        
        return AuthResponse(
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
            detail="An error occurred during registration"
        )


@router.post("/login", response_model=AuthResponse)
async def login_user(
    login_data: UserLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticate user and return access token
    
    Verifies user credentials and returns JWT access token and user information
    upon successful authentication.
    """
    try:
        # Get user by email
        user = get_user_by_email(db, login_data.email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Verify password
        if not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Update last login
        update_last_login(db, user)
        
        # Generate access token
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return AuthResponse(
            access_token=access_token,
            user=UserResponse.from_orm(user)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during login"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """
    Get current user profile
    
    Returns the profile information of the currently authenticated user.
    Requires valid JWT token in Authorization header.
    """
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    update_data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user profile
    
    Updates the profile information of the currently authenticated user.
    Email changes require password confirmation for security.
    """
    try:
        # If email is being changed, verify current password
        if update_data.email and update_data.email != current_user.email:
            if not update_data.password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is required to change email"
                )
            
            if not verify_password(update_data.password, current_user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Current password is incorrect"
                )
            
            # Check if new email is already taken
            existing_user = get_user_by_email(db, update_data.email)
            if existing_user and existing_user.id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email address is already in use"
                )
            
            current_user.email = update_data.email
        
        # Update name if provided
        if update_data.name:
            current_user.name = update_data.name
        
        db.commit()
        db.refresh(current_user)
        
        return UserResponse.from_orm(current_user)
        
    except HTTPException:
        db.rollback()
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
            detail="An error occurred while updating profile"
        )


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change user password
    
    Changes the password for the currently authenticated user.
    Requires current password verification for security.
    """
    try:
        # Verify current password
        if not verify_password(password_data.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect"
            )
        
        # Check if new password is different from current
        if verify_password(password_data.new_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from current password"
            )
        
        # Hash and save new password
        current_user.hashed_password = get_password_hash(password_data.new_password)
        db.commit()
        
        return MessageResponse(message="Password changed successfully")
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while changing password"
        )


# Error handlers for common validation errors
@router.exception_handler(ValueError)
async def validation_exception_handler(request, exc):
    """Handle validation errors"""
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=str(exc)
    )