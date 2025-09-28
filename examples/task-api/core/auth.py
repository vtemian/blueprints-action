"""
Authentication and Authorization Module for FastAPI Application

This module provides comprehensive JWT-based authentication utilities including
token generation, validation, password hashing, and FastAPI dependencies for
route protection.
"""

import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from models.user import User
from database import get_db


# Configuration
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Security contexts
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def create_access_token(data: Dict[str, Any]) -> str:
    """
    Generate a JWT access token with specified data and 24-hour expiration.
    
    Args:
        data (Dict[str, Any]): The payload data to encode in the token
        
    Returns:
        str: The encoded JWT token
        
    Raises:
        HTTPException: If token creation fails
        
    Example:
        >>> token = create_access_token({"sub": "user@example.com"})
    """
    try:
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        })
        
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create access token"
        )


def verify_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a JWT token, returning the payload if valid.
    
    Args:
        token (str): The JWT token to verify
        
    Returns:
        Dict[str, Any]: The decoded token payload
        
    Raises:
        HTTPException: If token is invalid, expired, or malformed
        
    Example:
        >>> payload = verify_token("eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...")
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Decode the token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Validate token type
        token_type = payload.get("type")
        if token_type != "access":
            raise credentials_exception
            
        # Validate expiration
        exp = payload.get("exp")
        if exp is None:
            raise credentials_exception
            
        # Check if token has expired
        if datetime.utcnow() > datetime.fromtimestamp(exp):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return payload
        
    except JWTError:
        raise credentials_exception
    except ValueError:
        raise credentials_exception
    except Exception:
        raise credentials_exception


def get_password_hash(password: str) -> str:
    """
    Hash a plain text password using bcrypt with 12 salt rounds.
    
    Args:
        password (str): The plain text password to hash
        
    Returns:
        str: The hashed password
        
    Raises:
        HTTPException: If password hashing fails
        
    Example:
        >>> hashed = get_password_hash("my_secure_password")
    """
    try:
        if not password:
            raise ValueError("Password cannot be empty")
            
        return pwd_context.hash(password)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not hash password"
        )


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against its hashed version.
    
    Args:
        plain_password (str): The plain text password to verify
        hashed_password (str): The hashed password to compare against
        
    Returns:
        bool: True if password matches, False otherwise
        
    Example:
        >>> is_valid = verify_password("password123", "$2b$12$...")
    """
    try:
        if not plain_password or not hashed_password:
            return False
            
        return pwd_context.verify(plain_password, hashed_password)
        
    except Exception:
        return False


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """
    Retrieve a user from the database by email address.
    
    Args:
        db (Session): Database session
        email (str): User's email address
        
    Returns:
        Optional[User]: User object if found, None otherwise
    """
    try:
        return db.query(User).filter(User.email == email).first()
    except Exception:
        return None


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Extract and validate user from JWT token, returning the user object.
    
    This function serves as a FastAPI dependency to get the current authenticated user.
    
    Args:
        token (str): JWT token from OAuth2 scheme
        db (Session): Database session dependency
        
    Returns:
        User: The authenticated user object
        
    Raises:
        HTTPException: If token is invalid or user not found
        
    Example:
        >>> @app.get("/protected")
        >>> def protected_route(current_user: User = Depends(get_current_user)):
        >>>     return {"user": current_user.email}
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Verify and decode the token
        payload = verify_token(token)
        
        # Extract user identifier from token
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
            
        # Fetch user from database
        user = get_user_by_email(db, email=email)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return user
        
    except HTTPException:
        raise
    except Exception:
        raise credentials_exception


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    FastAPI dependency to verify that the current user is active.
    
    Args:
        current_user (User): Current authenticated user from get_current_user dependency
        
    Returns:
        User: The active user object
        
    Raises:
        HTTPException: If user is inactive/disabled
        
    Example:
        >>> @app.get("/admin")
        >>> def admin_route(current_user: User = Depends(get_current_active_user)):
        >>>     return {"message": "Admin access granted"}
    """
    if not getattr(current_user, 'is_active', True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """
    Authenticate a user by email and password.
    
    Args:
        db (Session): Database session
        email (str): User's email address
        password (str): Plain text password
        
    Returns:
        Optional[User]: User object if authentication successful, None otherwise
        
    Example:
        >>> user = authenticate_user(db, "user@example.com", "password123")
    """
    try:
        user = get_user_by_email(db, email)
        if not user:
            return None
            
        if not verify_password(password, user.hashed_password):
            return None
            
        return user
        
    except Exception:
        return None


def create_user_token(user: User) -> Dict[str, Any]:
    """
    Create a complete token response for a user.
    
    Args:
        user (User): User object to create token for
        
    Returns:
        Dict[str, Any]: Token response with access_token and token_type
        
    Example:
        >>> token_data = create_user_token(user)
        >>> # Returns: {"access_token": "...", "token_type": "bearer"}
    """
    access_token = create_access_token(data={"sub": user.email})
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


# Optional: Admin user dependency
def get_current_admin_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    FastAPI dependency to verify that the current user has admin privileges.
    
    Args:
        current_user (User): Current active user
        
    Returns:
        User: The admin user object
        
    Raises:
        HTTPException: If user doesn't have admin privileges
    """
    if not getattr(current_user, 'is_admin', False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


# Token validation utility
def validate_token_format(token: str) -> bool:
    """
    Validate JWT token format without decoding.
    
    Args:
        token (str): Token to validate
        
    Returns:
        bool: True if format is valid, False otherwise
    """
    try:
        if not token or not isinstance(token, str):
            return False
            
        # JWT should have 3 parts separated by dots
        parts = token.split('.')
        return len(parts) == 3 and all(part for part in parts)
        
    except Exception:
        return False