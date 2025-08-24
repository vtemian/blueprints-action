"""
Authentication module for FastAPI application.

This module provides JWT token management, password hashing, and user authentication
functionality with proper security practices and error handling.
"""

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from models.user import User

# Configuration constants
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Get secret key from environment variables
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    import warnings
    warnings.warn(
        "SECRET_KEY environment variable not set. Using default key for development only. "
        "This is insecure for production use!",
        UserWarning
    )
    SECRET_KEY = "your-secret-key-change-this-in-production"

# Password hashing context with bcrypt and 12 salt rounds
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# OAuth2 scheme for token URL
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Exception for invalid credentials
credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

# Exception for inactive user
inactive_user_exception = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Inactive user",
)


def get_password_hash(password: str) -> str:
    """
    Hash a plain text password using bcrypt.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        Hashed password string
        
    Raises:
        ValueError: If password is empty or None
    """
    if not password:
        raise ValueError("Password cannot be empty")
    
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password to compare against
        
    Returns:
        True if password matches, False otherwise
        
    Raises:
        ValueError: If either password is empty or None
    """
    if not plain_password or not hashed_password:
        raise ValueError("Passwords cannot be empty")
    
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token with expiration.
    
    Args:
        data: Dictionary containing the data to encode in the token
        expires_delta: Optional custom expiration time delta
        
    Returns:
        Encoded JWT token string
        
    Raises:
        ValueError: If data is empty or None
    """
    if not data:
        raise ValueError("Token data cannot be empty")
    
    to_encode = data.copy()
    
    # Set expiration time
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    
    to_encode.update({"exp": expire})
    
    try:
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not create access token: {str(e)}"
        )


def verify_token(token: str) -> dict:
    """
    Verify and decode a JWT token.
    
    Args:
        token: JWT token string to verify
        
    Returns:
        Decoded token payload as dictionary
        
    Raises:
        HTTPException: If token is invalid, expired, or malformed
    """
    if not token:
        raise credentials_exception
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Validate payload structure
        if not isinstance(payload, dict):
            raise credentials_exception
            
        # Check if token has expired (jose should handle this, but double-check)
        exp = payload.get("exp")
        if exp is None:
            raise credentials_exception
            
        # Convert exp to datetime and check
        if datetime.utcnow() > datetime.fromtimestamp(exp):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return payload
        
    except JWTError as e:
        # Handle specific JWT errors
        error_msg = "Could not validate credentials"
        if "expired" in str(e).lower():
            error_msg = "Token has expired"
        elif "invalid" in str(e).lower():
            error_msg = "Invalid token"
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_msg,
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        # Handle any other unexpected errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Get the current user from JWT token.
    
    This dependency extracts the user information from the JWT token
    and retrieves the user from the database.
    
    Args:
        token: JWT token from OAuth2 scheme
        
    Returns:
        User object from database
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    try:
        # Verify and decode the token
        payload = verify_token(token)
        
        # Extract username/user_id from token
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise credentials_exception
            
        # Query user from database
        user = await User.get_by_username(username)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return user
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Handle any database or other errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get the current active user.
    
    This dependency ensures the current user is active/enabled.
    
    Args:
        current_user: Current user from get_current_user dependency
        
    Returns:
        Active user object
        
    Raises:
        HTTPException: If user is inactive
    """
    if not current_user.is_active:
        raise inactive_user_exception
    
    return current_user


# Utility function for authentication
async def authenticate_user(username: str, password: str) -> Optional[User]:
    """
    Authenticate a user with username and password.
    
    Args:
        username: Username to authenticate
        password: Plain text password
        
    Returns:
        User object if authentication successful, None otherwise
    """
    if not username or not password:
        return None
    
    try:
        # Get user from database
        user = await User.get_by_username(username)
        if not user:
            return None
        
        # Verify password
        if not verify_password(password, user.hashed_password):
            return None
            
        return user
        
    except Exception:
        # Log the error in production, but don't expose details
        return None


# Token creation helper for login endpoints
def create_user_access_token(user: User) -> str:
    """
    Create an access token for a specific user.
    
    Args:
        user: User object to create token for
        
    Returns:
        JWT access token string
    """
    access_token_data = {
        "sub": user.username,
        "user_id": user.id,
        "email": user.email,
    }
    
    return create_access_token(data=access_token_data)


# Optional: Dependency for admin users
async def get_current_admin_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    Get the current admin user.
    
    This dependency ensures the current user is an admin.
    
    Args:
        current_user: Current active user
        
    Returns:
        Admin user object
        
    Raises:
        HTTPException: If user is not an admin
    """
    if not getattr(current_user, 'is_admin', False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return current_user