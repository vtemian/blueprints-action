"""
Core authentication module for JWT token management and password security.

This module provides comprehensive authentication utilities including:
- JWT token generation and validation
- Secure password hashing and verification
- FastAPI integration with OAuth2 Bearer authentication
- User authentication and authorization dependencies
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Union

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from models.user import User
from database import get_db

# Constants
TOKEN_EXPIRE_HOURS = 24
ALGORITHM = "HS256"

# Environment configuration
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is required for JWT token generation. "
        "Please set a secure secret key with sufficient entropy (minimum 32 characters)."
    )

if len(SECRET_KEY) < 32:
    raise ValueError(
        "SECRET_KEY must be at least 32 characters long for security purposes."
    )

# Password hashing configuration
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12
)

# OAuth2 scheme for FastAPI integration
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/token",
    scheme_name="JWT"
)


def create_access_token(data: Dict[str, Any]) -> str:
    """
    Generate a JWT access token with 24-hour expiration.
    
    Args:
        data: Dictionary containing claims to encode in the token.
              Typically includes user identification information.
    
    Returns:
        str: Encoded JWT token string.
    
    Raises:
        ValueError: If data is empty or None.
        JWTError: If token encoding fails.
    
    Example:
        >>> token = create_access_token({"sub": "user123", "email": "user@example.com"})
    """
    if not data:
        raise ValueError("Token data cannot be empty")
    
    # Create a copy to avoid modifying the original data
    to_encode = data.copy()
    
    # Add expiration time (timezone-aware)
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),  # Issued at
        "type": "access_token"
    })
    
    try:
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        raise JWTError(f"Failed to encode JWT token: {str(e)}")


def verify_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a JWT token with comprehensive error handling.
    
    Args:
        token: JWT token string to decode and validate.
    
    Returns:
        Dict[str, Any]: Decoded token payload containing user claims.
    
    Raises:
        HTTPException: 401 status for invalid, expired, or malformed tokens.
    
    Example:
        >>> payload = verify_token("eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...")
        >>> user_id = payload.get("sub")
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not token or not token.strip():
        raise credentials_exception
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Validate token type
        token_type = payload.get("type")
        if token_type != "access_token":
            raise credentials_exception
        
        # Validate required claims
        if not payload.get("sub"):
            raise credentials_exception
            
        return payload
        
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        # Catch any other unexpected errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token validation failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_password_hash(password: str) -> str:
    """
    Hash a password securely using bcrypt with 12 salt rounds.
    
    Args:
        password: Plain text password to hash.
    
    Returns:
        str: Bcrypt hashed password string.
    
    Raises:
        ValueError: If password is empty or None.
        RuntimeError: If hashing operation fails.
    
    Example:
        >>> hashed = get_password_hash("my_secure_password")
    """
    if not password:
        raise ValueError("Password cannot be empty")
    
    if len(password.strip()) == 0:
        raise ValueError("Password cannot be only whitespace")
    
    try:
        return pwd_context.hash(password)
    except Exception as e:
        raise RuntimeError(f"Password hashing failed: {str(e)}")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash using timing-safe comparison.
    
    Args:
        plain_password: Plain text password to verify.
        hashed_password: Stored bcrypt hash to verify against.
    
    Returns:
        bool: True if password matches hash, False otherwise.
    
    Raises:
        ValueError: If either parameter is empty or None.
    
    Example:
        >>> is_valid = verify_password("user_input", stored_hash)
    """
    if not plain_password or not hashed_password:
        return False
    
    if not plain_password.strip() or not hashed_password.strip():
        return False
    
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Return False for any verification errors to prevent information leakage
        return False


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Extract user information from JWT token and fetch user from database.
    
    This function serves as a FastAPI dependency for protected routes.
    It validates the JWT token and retrieves the corresponding user from the database.
    
    Args:
        token: JWT token from Authorization header (injected by oauth2_scheme).
        db: Database session (injected by get_db dependency).
    
    Returns:
        User: User model instance from database.
    
    Raises:
        HTTPException: 401 status for invalid tokens or non-existent users.
    
    Example:
        >>> @app.get("/protected")
        >>> async def protected_route(current_user: User = Depends(get_current_user)):
        >>>     return {"user": current_user.username}
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Verify and decode the token
    payload = verify_token(token)
    
    # Extract user identifier from token
    user_identifier: str = payload.get("sub")
    if not user_identifier:
        raise credentials_exception
    
    try:
        # Try to find user by ID first, then by username/email
        user = None
        
        # Check if identifier is numeric (user ID)
        if user_identifier.isdigit():
            user = db.query(User).filter(User.id == int(user_identifier)).first()
        
        # If not found by ID, try username or email
        if not user:
            user = db.query(User).filter(
                (User.username == user_identifier) | 
                (User.email == user_identifier)
            ).first()
        
        if not user:
            raise credentials_exception
            
        return user
        
    except Exception as e:
        # Log the error in production, but don't expose details to client
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Dependency that ensures the current user is active.
    
    This function builds upon get_current_user to also verify that the user
    account is active and not disabled.
    
    Args:
        current_user: User instance from get_current_user dependency.
    
    Returns:
        User: Active user model instance.
    
    Raises:
        HTTPException: 403 status if user account is inactive/disabled.
    
    Example:
        >>> @app.get("/admin")
        >>> async def admin_route(user: User = Depends(get_current_active_user)):
        >>>     return {"message": f"Hello active user {user.username}"}
    """
    if not getattr(current_user, 'is_active', True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account. Please contact administrator."
        )
    
    return current_user


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """
    Authenticate a user with username/email and password.
    
    This utility function handles the complete authentication flow:
    finding the user and verifying their password.
    
    Args:
        db: Database session for user lookup.
        username: Username or email address.
        password: Plain text password.
    
    Returns:
        Optional[User]: User instance if authentication succeeds, None otherwise.
    
    Example:
        >>> user = authenticate_user(db, "john_doe", "password123")
        >>> if user:
        >>>     token = create_access_token({"sub": str(user.id)})
    """
    if not username or not password:
        return None
    
    try:
        # Find user by username or email
        user = db.query(User).filter(
            (User.username == username) | (User.email == username)
        ).first()
        
        if not user:
            return None
        
        # Verify password
        if not verify_password(password, user.hashed_password):
            return None
        
        return user
        
    except Exception:
        # Return None for any database or verification errors
        return None


# Utility function for token validation without database lookup
def validate_token_format(token: str) -> bool:
    """
    Validate JWT token format without database operations.
    
    Useful for lightweight token validation in middleware or
    non-database contexts.
    
    Args:
        token: JWT token string to validate.
    
    Returns:
        bool: True if token format is valid and not expired.
    
    Example:
        >>> if validate_token_format(token):
        >>>     # Token is structurally valid
        >>>     pass
    """
    try:
        verify_token(token)
        return True
    except HTTPException:
        return False


# Export main components for easy importing
__all__ = [
    "create_access_token",
    "verify_token", 
    "get_password_hash",
    "verify_password",
    "get_current_user",
    "get_current_active_user",
    "authenticate_user",
    "validate_token_format",
    "oauth2_scheme",
    "TOKEN_EXPIRE_HOURS",
    "ALGORITHM"
]