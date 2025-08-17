"""
Authentication and authorization utilities for FastAPI application.

This module provides JWT token management, password hashing, and FastAPI
dependencies for user authentication and authorization.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from models.user import User


# Configuration constants
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
if len(SECRET_KEY) < 32:
    raise ValueError("SECRET_KEY must be at least 32 characters long")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
BCRYPT_ROUNDS = 12

# Security contexts
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=BCRYPT_ROUNDS)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(data: Dict[str, Any]) -> str:
    """
    Generate a JWT access token with 24-hour expiration.
    
    Args:
        data: Dictionary containing claims to encode in the token
        
    Returns:
        Encoded JWT token string
        
    Raises:
        ValueError: If token generation fails
    """
    try:
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        to_encode.update({"exp": expire})
        
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        raise ValueError(f"Failed to create access token: {str(e)}")


def verify_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a JWT token.
    
    Args:
        token: JWT token string to validate
        
    Returns:
        Dictionary containing the token payload
        
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
    except jwt.InvalidTokenError:
        raise credentials_exception
    except JWTError:
        raise credentials_exception


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt with 12 salt rounds.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        Bcrypt hashed password string
        
    Raises:
        ValueError: If password hashing fails
    """
    try:
        if not password:
            raise ValueError("Password cannot be empty")
        return pwd_context.hash(password)
    except Exception as e:
        raise ValueError(f"Failed to hash password: {str(e)}")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against a hashed password.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Bcrypt hashed password to compare against
        
    Returns:
        True if password matches, False otherwise
        
    Raises:
        ValueError: If password verification fails
    """
    try:
        if not plain_password or not hashed_password:
            return False
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        raise ValueError(f"Failed to verify password: {str(e)}")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Extract and return user from JWT token.
    
    FastAPI dependency that validates the JWT token and returns the current user.
    
    Args:
        token: JWT token from Authorization header
        
    Returns:
        User object for the authenticated user
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Verify and decode the token
        payload = verify_token(token)
        user_id: Optional[str] = payload.get("sub")
        
        if user_id is None:
            raise credentials_exception
            
    except HTTPException:
        raise
    except Exception:
        raise credentials_exception
    
    try:
        # Get user from database
        user = await User.get_by_id(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve user information"
        )


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency that ensures the current user is active.
    
    Args:
        current_user: User object from get_current_user dependency
        
    Returns:
        Active user object
        
    Raises:
        HTTPException: If user is inactive
    """
    if not getattr(current_user, 'is_active', True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account"
        )
    return current_user


# Utility function for token extraction without dependency injection
def extract_user_id_from_token(token: str) -> Optional[str]:
    """
    Extract user ID from JWT token without database lookup.
    
    Args:
        token: JWT token string
        
    Returns:
        User ID if token is valid, None otherwise
    """
    try:
        payload = verify_token(token)
        return payload.get("sub")
    except HTTPException:
        return None


# Token validation utility
def is_token_valid(token: str) -> bool:
    """
    Check if a JWT token is valid without extracting payload.
    
    Args:
        token: JWT token string to validate
        
    Returns:
        True if token is valid, False otherwise
    """
    try:
        verify_token(token)
        return True
    except HTTPException:
        return False