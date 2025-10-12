"""
Authentication and authorization utilities for the application.

This module provides JWT token management, password hashing/verification,
and FastAPI dependencies for user authentication and authorization.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt, ExpiredSignatureError, JWTClaimsError
from passlib.context import CryptContext
from passlib.exc import InvalidHashError

from models.user import User


# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
BCRYPT_ROUNDS = 12

# Security contexts
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=BCRYPT_ROUNDS)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# Exception messages
INVALID_CREDENTIALS_MSG = "Could not validate credentials"
INACTIVE_USER_MSG = "Inactive user"
TOKEN_EXPIRED_MSG = "Token has expired"
INVALID_TOKEN_MSG = "Invalid token"


def create_access_token(data: Dict[str, Any]) -> str:
    """
    Create a JWT access token with expiration.
    
    Args:
        data: Dictionary containing claims to encode in the token
        
    Returns:
        str: Encoded JWT token
        
    Raises:
        ValueError: If data is empty or invalid
        RuntimeError: If token creation fails
    """
    if not data:
        raise ValueError("Token data cannot be empty")
    
    try:
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        to_encode.update({"exp": expire})
        
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        raise RuntimeError(f"Failed to create access token: {str(e)}")


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
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_TOKEN_MSG,
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=TOKEN_EXPIRED_MSG,
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (JWTError, JWTClaimsError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_TOKEN_MSG,
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt with configured salt rounds.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        str: Bcrypt hashed password
        
    Raises:
        ValueError: If password is empty or invalid
        RuntimeError: If hashing fails
    """
    if not password:
        raise ValueError("Password cannot be empty")
    
    if len(password.strip()) == 0:
        raise ValueError("Password cannot be only whitespace")
    
    try:
        return pwd_context.hash(password)
    except Exception as e:
        raise RuntimeError(f"Failed to hash password: {str(e)}")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against a hashed password.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Stored bcrypt hash to verify against
        
    Returns:
        bool: True if password matches, False otherwise
        
    Raises:
        ValueError: If either password parameter is empty
    """
    if not plain_password or not hashed_password:
        return False
    
    if not plain_password.strip() or not hashed_password.strip():
        return False
    
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (InvalidHashError, ValueError):
        # Invalid hash format or verification error
        return False
    except Exception:
        # Any other unexpected error during verification
        return False


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    FastAPI dependency to extract and return the current user from JWT token.
    
    Args:
        token: JWT token from Authorization header
        
    Returns:
        User: Current authenticated user
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=INVALID_CREDENTIALS_MSG,
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Verify and decode the token
        payload = verify_token(token)
        
        # Extract user identifier from token
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            raise credentials_exception
            
    except HTTPException:
        # Re-raise HTTP exceptions from verify_token
        raise
    except Exception:
        # Catch any other unexpected errors
        raise credentials_exception
    
    try:
        # Look up user in database
        user = await User.get_by_id(user_id)
        if user is None:
            raise credentials_exception
            
        return user
    except Exception as e:
        # Database lookup failed
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User lookup failed"
        )


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency to get current user and verify they are active.
    
    Args:
        current_user: Current user from get_current_user dependency
        
    Returns:
        User: Current active user
        
    Raises:
        HTTPException: If user is inactive
    """
    if not getattr(current_user, 'is_active', True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=INACTIVE_USER_MSG
        )
    
    return current_user


def create_user_token(user: User) -> str:
    """
    Create an access token for a specific user.
    
    Args:
        user: User object to create token for
        
    Returns:
        str: JWT access token
        
    Raises:
        ValueError: If user is invalid
        RuntimeError: If token creation fails
    """
    if not user or not hasattr(user, 'id'):
        raise ValueError("Invalid user object")
    
    token_data = {
        "sub": str(user.id),
        "username": getattr(user, 'username', ''),
        "email": getattr(user, 'email', ''),
    }
    
    return create_access_token(token_data)


def validate_token_format(token: str) -> bool:
    """
    Validate JWT token format without full verification.
    
    Args:
        token: Token string to validate
        
    Returns:
        bool: True if token has valid JWT format
    """
    if not token or not isinstance(token, str):
        return False
    
    # JWT tokens have 3 parts separated by dots
    parts = token.split('.')
    if len(parts) != 3:
        return False
    
    # Each part should be non-empty
    return all(part.strip() for part in parts)


# Environment validation
def validate_environment() -> None:
    """
    Validate required environment variables and configuration.
    
    Raises:
        RuntimeError: If environment is not properly configured
    """
    if SECRET_KEY == "your-secret-key-change-in-production":
        if os.getenv("ENVIRONMENT", "development") == "production":
            raise RuntimeError(
                "SECRET_KEY must be set to a secure value in production"
            )
    
    if len(SECRET_KEY) < 32:
        raise RuntimeError(
            "SECRET_KEY must be at least 32 characters long"
        )


# Initialize environment validation
try:
    validate_environment()
except RuntimeError as e:
    # Log the error but don't crash the application during import
    print(f"Warning: {e}")