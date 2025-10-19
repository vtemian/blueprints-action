"""
FastAPI User Management Module

This module provides comprehensive user management functionality including
registration, authentication, profile management, and password operations.
"""

from datetime import datetime, timedelta
from typing import Optional, Annotated
import re

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field, validator
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

# Assuming these imports exist in your project structure
from database import get_db  # Database session dependency
from models.user import User  # SQLAlchemy User model
from config import settings  # Configuration settings

# Security configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# JWT Configuration
SECRET_KEY = settings.SECRET_KEY  # Should be loaded from environment
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Create router instance
router = APIRouter(prefix="/api/users", tags=["users"])


# ================================
# PYDANTIC SCHEMAS
# ================================

class UserRegisterSchema(BaseModel):
    """Schema for user registration"""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=8, description="User's password (minimum 8 characters)")
    name: str = Field(..., min_length=2, max_length=100, description="User's full name")
    
    @validator('password')
    def validate_password(cls, v):
        """Validate password strength"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v
    
    @validator('name')
    def validate_name(cls, v):
        """Validate name format"""
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()

    class Config:
        schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "securepass123",
                "name": "John Doe"
            }
        }


class UserLoginSchema(BaseModel):
    """Schema for user login"""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")

    class Config:
        schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "securepass123"
            }
        }


class UserUpdateSchema(BaseModel):
    """Schema for updating user profile"""
    name: Optional[str] = Field(None, min_length=2, max_length=100, description="User's full name")
    email: Optional[EmailStr] = Field(None, description="User's new email address")
    password_confirmation: Optional[str] = Field(None, description="Current password (required when changing email)")
    
    @validator('name')
    def validate_name(cls, v):
        """Validate name format"""
        if v is not None and not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip() if v else v
    
    @validator('password_confirmation')
    def validate_password_confirmation(cls, v, values):
        """Require password confirmation when changing email"""
        if values.get('email') and not v:
            raise ValueError('Password confirmation is required when changing email')
        return v

    class Config:
        schema_extra = {
            "example": {
                "name": "John Smith",
                "email": "newemail@example.com",
                "password_confirmation": "currentpassword"
            }
        }


class PasswordChangeSchema(BaseModel):
    """Schema for changing password"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")
    
    @validator('new_password')
    def validate_new_password(cls, v):
        """Validate new password strength"""
        if len(v) < 8:
            raise ValueError('New password must be at least 8 characters long')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('New password must contain at least one letter')
        if not re.search(r'\d', v):
            raise ValueError('New password must contain at least one digit')
        return v

    class Config:
        schema_extra = {
            "example": {
                "current_password": "oldpassword123",
                "new_password": "newpassword456"
            }
        }


class UserResponse(BaseModel):
    """Schema for user response (excludes sensitive data)"""
    id: int
    email: str
    name: str
    created_at: datetime
    last_login: Optional[datetime] = None
    is_active: bool = True

    class Config:
        from_attributes = True
        schema_extra = {
            "example": {
                "id": 1,
                "email": "user@example.com",
                "name": "John Doe",
                "created_at": "2023-01-01T00:00:00",
                "last_login": "2023-01-01T12:00:00",
                "is_active": True
            }
        }


class AuthResponse(BaseModel):
    """Schema for authentication response"""
    user: UserResponse
    access_token: str
    token_type: str = "bearer"

    class Config:
        schema_extra = {
            "example": {
                "user": {
                    "id": 1,
                    "email": "user@example.com",
                    "name": "John Doe",
                    "created_at": "2023-01-01T00:00:00",
                    "last_login": "2023-01-01T12:00:00",
                    "is_active": True
                },
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer"
            }
        }


class MessageResponse(BaseModel):
    """Schema for simple message responses"""
    message: str

    class Config:
        schema_extra = {
            "example": {
                "message": "Operation completed successfully"
            }
        }


# ================================
# UTILITY FUNCTIONS
# ================================

def hash_password(password: str) -> str:
    """Hash a password using bcrypt with 12 rounds"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email address"""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Get user by ID"""
    return db.query(User).filter(User.id == user_id).first()


# ================================
# DEPENDENCY FUNCTIONS
# ================================

async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> User:
    """
    Dependency to get the current authenticated user from JWT token
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = get_user_by_id(db, user_id=user_id)
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user"
        )
    
    return user


# ================================
# ENDPOINT HANDLERS
# ================================

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserRegisterSchema,
    db: Annotated[Session, Depends(get_db)]
) -> AuthResponse:
    """
    Register a new user account
    
    Creates a new user with the provided email, password, and name.
    Returns the user data along with an access token for immediate authentication.
    
    - **email**: Valid email address (must be unique)
    - **password**: Minimum 8 characters with at least one letter and one digit
    - **name**: User's full name (2-100 characters)
    
    Raises:
        - 400: Email already registered or validation errors
        - 500: Server error during user creation
    """
    try:
        # Check if user already exists
        existing_user = get_user_by_email(db, user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Create new user
        hashed_password = hash_password(user_data.password)
        db_user = User(
            email=user_data.email,
            name=user_data.name,
            hashed_password=hashed_password,
            created_at=datetime.utcnow(),
            is_active=True
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        # Create access token
        access_token = create_access_token(data={"sub": db_user.id})
        
        return AuthResponse(
            user=UserResponse.from_orm(db_user),
            access_token=access_token
        )
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account"
        )


@router.post("/login", response_model=AuthResponse)
async def login_user(
    login_data: UserLoginSchema,
    db: Annotated[Session, Depends(get_db)]
) -> AuthResponse:
    """
    Authenticate user and return access token
    
    Validates user credentials and returns user data with access token.
    Updates the user's last_login timestamp upon successful authentication.
    
    - **email**: User's registered email address
    - **password**: User's password
    
    Raises:
        - 401: Invalid email or password
        - 401: User account is inactive
    """
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
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": user.id})
    
    return AuthResponse(
        user=UserResponse.from_orm(user),
        access_token=access_token
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: Annotated[User, Depends(get_current_user)]
) -> UserResponse:
    """
    Get current user's profile information
    
    Returns the authenticated user's profile data (excluding sensitive information).
    Requires valid JWT token in Authorization header.
    
    Raises:
        - 401: Invalid or expired token
        - 401: User account is inactive
    """
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    update_data: UserUpdateSchema,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)]
) -> UserResponse:
    """
    Update current user's profile information
    
    Updates the authenticated user's profile. When changing email,
    password confirmation is required for security.
    
    - **name**: New name (optional)
    - **email**: New email address (optional, requires password_confirmation)
    - **password_confirmation**: Current password (required when changing email)
    
    Raises:
        - 400: Email already in use or validation errors
        - 401: Invalid password confirmation
        - 401: Invalid or expired token
    """
    try:
        update_fields = {}
        
        # Update name if provided
        if update_data.name is not None:
            update_fields['name'] = update_data.name
        
        # Update email if provided
        if update_data.email is not None:
            # Verify password confirmation
            if not verify_password(update_data.password_confirmation, current_user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid password confirmation"
                )
            
            # Check if new email is already in use
            existing_user = get_user_by_email(db, update_data.email)
            if existing_user and existing_user.id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use"
                )
            
            update_fields['email'] = update_data.email
        
        # Apply updates
        for field, value in update_fields.items():
            setattr(current_user, field, value)
        
        db.commit()
        db.refresh(current_user)
        
        return UserResponse.from_orm(current_user)
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,