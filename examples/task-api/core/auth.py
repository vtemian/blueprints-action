"""
Authentication and authorization utilities for FastAPI application.

This module provides JWT token management, password hashing/verification,
and FastAPI security dependencies for protected routes.
"""

import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from models.user import User


# Configuration constants
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is required for JWT token signing. "
        "Please set SECRET_KEY in your environment variables."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Security configurations
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(data: Dict[str, Any]) -> str:
    """
    Generate a JWT access token with 24-hour expiration.
    
    Args:
        data: Dictionary containing the payload data to encode in the token
        
    Returns:
        str: Encoded JWT token
        
    Raises:
        Exception: If token creation fails
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    
    try:
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        raise Exception(f"Failed to create access token: {str(e)}")


def verify_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a JWT token.
    
    Args:
        token: JWT token string to verify
        
    Returns:
        Dict[str, Any]: Decoded token payload
        
    Raises:
        HTTPException: If token is invalid, expired, or malformed
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.JWTClaimsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.JWTError:
        raise credentials_exception
    except Exception:
        raise credentials_exception


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt with 12 salt rounds.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        str: Hashed password
        
    Raises:
        Exception: If password hashing fails
    """
    try:
        return pwd_context.hash(password)
    except Exception as e:
        raise Exception(f"Failed to hash password: {str(e)}")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against its hash.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password to compare against
        
    Returns:
        bool: True if password matches, False otherwise
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Extract and return user information from JWT token.
    
    Args:
        token: JWT token from Authorization header
        
    Returns:
        User: User object extracted from token
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = verify_token(token)
        user_id: Optional[str] = payload.get("sub")
        
        if user_id is None:
            raise credentials_exception
            
        # Create user object from token payload
        # In a real application, you might want to fetch from database
        user_data = {
            "id": user_id,
            "email": payload.get("email"),
            "username": payload.get("username"),
            "is_active": payload.get("is_active", True),
        }
        
        user = User(**user_data)
        return user
        
    except HTTPException:
        raise
    except Exception:
        raise credentials_exception


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency to verify that the current user is active.
    
    Args:
        current_user: User object from get_current_user dependency
        
    Returns:
        User: Active user object
        
    Raises:
        HTTPException: If user is inactive
    """
    if not getattr(current_user, 'is_active', True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


# Additional utility functions for enhanced security

def create_user_token_data(user: User) -> Dict[str, Any]:
    """
    Create token payload data from user object.
    
    Args:
        user: User object to create token data for
        
    Returns:
        Dict[str, Any]: Token payload data
    """
    return {
        "sub": str(user.id),
        "email": getattr(user, 'email', None),
        "username": getattr(user, 'username', None),
        "is_active": getattr(user, 'is_active', True),
    }


def validate_token_format(token: str) -> bool:
    """
    Validate basic JWT token format without decoding.
    
    Args:
        token: Token string to validate
        
    Returns:
        bool: True if token format is valid, False otherwise
    """
    if not token or not isinstance(token, str):
        return False
    
    # JWT tokens have 3 parts separated by dots
    parts = token.split('.')
    return len(parts) == 3 and all(part for part in parts)


# Exception classes for better error handling

class AuthenticationError(Exception):
    """Custom exception for authentication errors."""
    pass


class TokenError(AuthenticationError):
    """Custom exception for token-related errors."""
    pass


class PasswordError(AuthenticationError):
    """Custom exception for password-related errors."""
    pass