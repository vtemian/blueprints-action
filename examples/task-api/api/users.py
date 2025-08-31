"""
User Management and Authentication API Module

This module provides comprehensive user management functionality including
registration, authentication, profile management, and password operations.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, validator, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from passlib.context import CryptContext
from jose import JWTError, jwt
import re

# Internal imports
from models.user import User
from core.auth import create_access_token, verify_token, get_current_user
from core.database import get_db

# Security setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Router setup
router = APIRouter(prefix="/api/users", tags=["users"])

# JWT Configuration (should be in environment variables in production)
SECRET_KEY = "your-secret-key-here"  # Move to environment variables
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


# ================================
# PYDANTIC SCHEMAS
# ================================

class UserBase(BaseModel):
    """Base user schema with common fields."""
    email: EmailStr = Field(..., description="User's email address")
    name: str = Field(..., min_length=2, max_length=100, description="User's full name")

    @validator('name')
    def validate_name(cls, v):
        """Validate and sanitize name field."""
        if not v or not v.strip():
            raise ValueError('Name cannot be empty')
        # Remove extra whitespace and validate characters
        name = re.sub(r'\s+', ' ', v.strip())
        if not re.match(r'^[a-zA-Z\s\-\'\.]+$', name):
            raise ValueError('Name contains invalid characters')
        return name


class UserCreate(UserBase):
    """Schema for user registration."""
    password: str = Field(..., min_length=8, description="User's password")
    password_confirm: str = Field(..., description="Password confirmation")

    @validator('password')
    def validate_password(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        
        # Check for at least one uppercase, lowercase, digit, and special character
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        
        return v

    @validator('password_confirm')
    def passwords_match(cls, v, values):
        """Ensure password confirmation matches password."""
        if 'password' in values and v != values['password']:
            raise ValueError('Passwords do not match')
        return v


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")


class UserUpdate(BaseModel):
    """Schema for user profile updates."""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None

    @validator('name')
    def validate_name(cls, v):
        """Validate and sanitize name field."""
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Name cannot be empty')
            name = re.sub(r'\s+', ' ', v.strip())
            if not re.match(r'^[a-zA-Z\s\-\'\.]+$', name):
                raise ValueError('Name contains invalid characters')
            return name
        return v


class PasswordChange(BaseModel):
    """Schema for password change."""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")
    new_password_confirm: str = Field(..., description="New password confirmation")

    @validator('new_password')
    def validate_new_password(cls, v):
        """Validate new password strength."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        
        return v

    @validator('new_password_confirm')
    def passwords_match(cls, v, values):
        """Ensure new password confirmation matches new password."""
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('New passwords do not match')
        return v


class UserResponse(UserBase):
    """Schema for user response (excludes sensitive data)."""
    id: int = Field(..., description="User's unique identifier")
    created_at: datetime = Field(..., description="Account creation timestamp")
    last_login: Optional[datetime] = Field(None, description="Last login timestamp")
    is_active: bool = Field(..., description="Account active status")

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Schema for authentication token response."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration time in seconds")
    user: UserResponse = Field(..., description="User information")


# ================================
# UTILITY FUNCTIONS
# ================================

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Retrieve user by email address."""
    try:
        return db.query(User).filter(User.email == email.lower()).first()
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred while fetching user"
        )


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Authenticate user with email and password."""
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        return None
    return user


# ================================
# API ENDPOINTS
# ================================

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db)
) -> UserResponse:
    """
    Register a new user account.
    
    Creates a new user with the provided information after validating
    email uniqueness and password requirements.
    
    Args:
        user_data: User registration data
        db: Database session
        
    Returns:
        UserResponse: Created user information (excluding password)
        
    Raises:
        HTTPException: 409 if email already exists, 400 for validation errors
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
        hashed_password = hash_password(user_data.password)
        db_user = User(
            email=user_data.email.lower(),
            name=user_data.name,
            password_hash=hashed_password,
            created_at=datetime.utcnow(),
            is_active=True
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        return UserResponse.from_orm(db_user)
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already registered"
        )
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred during registration"
        )


@router.post("/login", response_model=TokenResponse)
async def login_user(
    login_data: UserLogin,
    db: Session = Depends(get_db)
) -> TokenResponse:
    """
    Authenticate user and return access token.
    
    Validates user credentials and returns a JWT token for authenticated requests.
    
    Args:
        login_data: User login credentials
        db: Database session
        
    Returns:
        TokenResponse: JWT token and user information
        
    Raises:
        HTTPException: 401 for invalid credentials, 403 for inactive accounts
    """
    try:
        # Authenticate user
        user = authenticate_user(db, login_data.email, login_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if user account is active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated"
            )
        
        # Update last login timestamp
        user.last_login = datetime.utcnow()
        db.commit()
        
        # Create access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=access_token_expires
        )
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse.from_orm(user)
        )
        
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred during login"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
) -> UserResponse:
    """
    Get current authenticated user's profile.
    
    Returns the profile information of the currently authenticated user.
    
    Args:
        current_user: Current authenticated user from JWT token
        
    Returns:
        UserResponse: Current user's profile information
    """
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> UserResponse:
    """
    Update current user's profile information.
    
    Updates the authenticated user's profile with provided information.
    Email uniqueness is validated if email is being changed.
    
    Args:
        user_update: Updated user information
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        UserResponse: Updated user information
        
    Raises:
        HTTPException: 409 if new email already exists, 400 for validation errors
    """
    try:
        update_data = user_update.dict(exclude_unset=True)
        
        # Check email uniqueness if email is being updated
        if "email" in update_data and update_data["email"] != current_user.email:
            existing_user = get_user_by_email(db, update_data["email"])
            if existing_user and existing_user.id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email address is already in use"
                )
            update_data["email"] = update_data["email"].lower()
        
        # Update user fields
        for field, value in update_data.items():
            setattr(current_user, field, value)
        
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
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred during profile update"
        )


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> dict:
    """
    Change user's password.
    
    Updates the authenticated user's password after verifying the current password.
    
    Args:
        password_data: Password change data including current and new passwords
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        dict: Success message
        
    Raises:
        HTTPException: 400 for invalid current password or validation errors
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
        
        # Update password
        current_user.password_hash = hash_password(password_data.new_password)
        db.commit()
        
        return {"message": "Password changed successfully"}
        
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred during password change"
        )


# ================================
# ERROR HANDLERS
# ================================

@router.exception_handler(ValueError)
async def validation_exception_handler(request, exc):
    """Handle validation errors."""
    raise HTTPException(
        status_code=