"""
User management and authentication API endpoints.
Provides secure user registration, login, profile management, and password operations.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, validator, Field
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

# Internal imports
from models.user import User
from core.auth import create_access_token, get_current_user, verify_token
from core.database import get_db

# Password hashing configuration using bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Router configuration
router = APIRouter(prefix="/api/users", tags=["users"])


# Pydantic Models
class UserRegister(BaseModel):
    """User registration request model."""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=8, description="User's password (minimum 8 characters)")
    name: str = Field(..., min_length=1, max_length=100, description="User's full name")

    @validator('password')
    def validate_password(cls, v):
        """Validate password strength requirements."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

    @validator('name')
    def validate_name(cls, v):
        """Sanitize and validate user name."""
        # Strip whitespace and validate length
        v = v.strip()
        if not v:
            raise ValueError('Name cannot be empty')
        # Basic sanitization - remove potentially harmful characters
        if any(char in v for char in ['<', '>', '"', "'"]):
            raise ValueError('Name contains invalid characters')
        return v


class UserLogin(BaseModel):
    """User login request model."""
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")


class UserUpdate(BaseModel):
    """User profile update request model."""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Updated name")
    email: Optional[EmailStr] = Field(None, description="Updated email address")
    current_password: Optional[str] = Field(None, description="Current password (required for email changes)")

    @validator('name')
    def validate_name(cls, v):
        """Sanitize and validate user name."""
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError('Name cannot be empty')
            if any(char in v for char in ['<', '>', '"', "'"]):
                raise ValueError('Name contains invalid characters')
        return v

    @validator('email', 'current_password')
    def validate_email_password_dependency(cls, v, values):
        """Ensure current password is provided when changing email."""
        if 'email' in values and values['email'] is not None and v is None:
            raise ValueError('Current password is required when changing email')
        return v


class ChangePassword(BaseModel):
    """Password change request model."""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")

    @validator('new_password')
    def validate_new_password(cls, v):
        """Validate new password strength requirements."""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v


class UserResponse(BaseModel):
    """User response model (excludes sensitive information)."""
    id: int
    email: str
    name: str
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    """Login response model with token and user info."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Utility functions
def hash_password(password: str) -> str:
    """Hash a password using bcrypt with proper salt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash using constant-time comparison."""
    return pwd_context.verify(plain_password, hashed_password)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Retrieve user by email address."""
    return db.query(User).filter(User.email == email.lower()).first()


# API Endpoints
@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserRegister,
    db: Session = Depends(get_db)
) -> LoginResponse:
    """
    Register a new user account.
    
    - **email**: Valid email address (must be unique)
    - **password**: Minimum 8 characters with uppercase, lowercase, and digit
    - **name**: User's full name
    
    Returns JWT token and user information upon successful registration.
    """
    try:
        # Check if user already exists (case-insensitive email check)
        existing_user = get_user_by_email(db, user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email address is already registered"
            )

        # Hash the password
        hashed_password = hash_password(user_data.password)

        # Create new user
        db_user = User(
            email=user_data.email.lower(),  # Store email in lowercase
            password_hash=hashed_password,
            name=user_data.name,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            is_active=True
        )

        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        # Generate JWT token
        access_token = create_access_token(data={"sub": str(db_user.id)})

        return LoginResponse(
            access_token=access_token,
            user=UserResponse.from_orm(db_user)
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


@router.post("/login", response_model=LoginResponse)
async def login_user(
    login_data: UserLogin,
    db: Session = Depends(get_db)
) -> LoginResponse:
    """
    Authenticate user and return JWT token.
    
    - **email**: User's email address
    - **password**: User's password
    
    Returns JWT token and user information upon successful authentication.
    """
    try:
        # Get user by email
        user = get_user_by_email(db, login_data.email)
        
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Verify password using constant-time comparison
        if not verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Update last login timestamp
        user.last_login = datetime.utcnow()
        user.updated_at = datetime.utcnow()
        db.commit()

        # Generate JWT token
        access_token = create_access_token(data={"sub": str(user.id)})

        return LoginResponse(
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


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
) -> UserResponse:
    """
    Get the authenticated user's profile information.
    
    Requires valid JWT token in Authorization header.
    Returns user profile without sensitive information.
    """
    return UserResponse.from_orm(current_user)


@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> UserResponse:
    """
    Update the authenticated user's profile information.
    
    - **name**: Updated full name (optional)
    - **email**: Updated email address (optional, requires current_password)
    - **current_password**: Required when changing email address
    
    Returns updated user profile information.
    """
    try:
        update_fields = {}

        # Handle name update
        if update_data.name is not None:
            update_fields['name'] = update_data.name

        # Handle email update (requires password verification)
        if update_data.email is not None:
            if not update_data.current_password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is required to change email address"
                )

            # Verify current password
            if not verify_password(update_data.current_password, current_user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Current password is incorrect"
                )

            # Check if new email is already taken
            if update_data.email.lower() != current_user.email:
                existing_user = get_user_by_email(db, update_data.email)
                if existing_user:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Email address is already in use"
                    )

            update_fields['email'] = update_data.email.lower()

        # Apply updates if any
        if update_fields:
            for field, value in update_fields.items():
                setattr(current_user, field, value)
            
            current_user.updated_at = datetime.utcnow()
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
            detail="Failed to update user profile"
        )


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_user_password(
    password_data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> dict:
    """
    Change the authenticated user's password.
    
    - **current_password**: User's current password
    - **new_password**: New password (minimum 8 characters with complexity requirements)
    
    Returns success message upon completion.
    """
    try:
        # Verify current password
        if not verify_password(password_data.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect"
            )

        # Check that new password is different from current
        if verify_password(password_data.new_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from current password"
            )

        # Hash new password and update user
        new_password_hash = hash_password(password_data.new_password)
        current_user.password_hash = new_password_hash
        current_user.updated_at = datetime.utcnow()
        
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
@router.get("/health")
async def users_health_check() -> dict:
    """Health check endpoint for the users API module."""
    return {
        "status": "healthy",
        "module": "users",
        "timestamp": datetime.utcnow().isoformat()
    }