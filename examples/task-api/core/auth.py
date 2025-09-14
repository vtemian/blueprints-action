"""
Authentication and Authorization Module for FastAPI

This module provides comprehensive JWT-based authentication and authorization
functionality with secure password handling and proper error management.
"""

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from fastapi import HTTPException, Depends, status
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import os


# Configuration Constants
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Environment variable validation
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is required for JWT token generation. "
        "Please set SECRET_KEY in your environment variables."
    )

# Password hashing context with bcrypt and 12 salt rounds
pwd_context = CryptContext(
    schemes=["bcrypt"], 
    deprecated="auto",
    bcrypt__rounds=12
)

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Credentials exception for reuse
credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def create_access_token(data: Dict[str, Any]) -> str:
    """
    Create a JWT access token with the provided data.
    
    Args:
        data: Dictionary containing the data to encode in the token
        
    Returns:
        str: Encoded JWT token
        
    Raises:
        HTTPException: If token creation fails
    """
    try:
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        to_encode.update({"exp": expire})
        
        # Ensure 'sub' field exists for JWT standard compliance
        if "sub" not in to_encode:
            raise ValueError("Token data must include 'sub' field")
            
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create access token: {str(e)}"
        )


def verify_token(token: str) -> Optional[str]:
    """
    Verify and decode a JWT token.
    
    Args:
        token: JWT token string to verify
        
    Returns:
        Optional[str]: Username from token if valid, None if invalid
    """
    try:
        # Decode and verify the token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        
        if username is None:
            return None
            
        # Check if token has expired (jwt.decode handles this, but explicit check for clarity)
        exp = payload.get("exp")
        if exp is None:
            return None
            
        # Convert exp to datetime and check
        if datetime.utcnow() > datetime.fromtimestamp(exp):
            return None
            
        return username
        
    except JWTError as e:
        # Log the specific JWT error for debugging (in production, use proper logging)
        print(f"JWT Error: {str(e)}")
        return None
    except Exception as e:
        # Handle any other unexpected errors
        print(f"Token verification error: {str(e)}")
        return None


def get_password_hash(password: str) -> str:
    """
    Hash a plain text password using bcrypt.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        str: Hashed password
        
    Raises:
        HTTPException: If password hashing fails
    """
    try:
        if not password:
            raise ValueError("Password cannot be empty")
            
        return pwd_context.hash(password)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to hash password: {str(e)}"
        )


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password to compare against
        
    Returns:
        bool: True if password matches, False otherwise
    """
    try:
        if not plain_password or not hashed_password:
            return False
            
        return pwd_context.verify(plain_password, hashed_password)
        
    except Exception as e:
        # Log error but don't expose details for security
        print(f"Password verification error: {str(e)}")
        return False


# Database dependency (to be implemented based on your database setup)
def get_database():
    """
    Database dependency - implement based on your database setup.
    This is a placeholder that should be replaced with your actual database connection.
    """
    # Example: return SessionLocal() for SQLAlchemy
    # or return your database connection/session
    pass


def get_user_by_username(username: str, db=None):
    """
    Retrieve user from database by username.
    
    This is a placeholder function that should be implemented based on your
    database setup and User model.
    
    Args:
        username: Username to search for
        db: Database session/connection
        
    Returns:
        User object if found, None otherwise
    """
    # Placeholder implementation - replace with your actual database query
    # Example for SQLAlchemy:
    # return db.query(User).filter(User.username == username).first()
    
    # For demonstration purposes, this should be replaced with actual database logic
    from typing import NamedTuple
    
    class User(NamedTuple):
        username: str
        email: str
        is_active: bool
        hashed_password: str
    
    # This is just a placeholder - implement your actual user retrieval logic
    return None


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Get the current authenticated user from JWT token.
    
    Args:
        token: JWT token from Authorization header
        
    Returns:
        User: Current authenticated user object
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    try:
        # Verify the token and extract username
        username = verify_token(token)
        if username is None:
            raise credentials_exception
            
        # Get database session (implement based on your setup)
        db = get_database()  # Replace with your database dependency
        
        # Retrieve user from database
        user = get_user_by_username(username, db)
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
        # Handle any unexpected errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_active_user(current_user = Depends(get_current_user)):
    """
    Get the current authenticated and active user.
    
    Args:
        current_user: Current user from get_current_user dependency
        
    Returns:
        User: Current active user object
        
    Raises:
        HTTPException: If user is inactive
    """
    if not getattr(current_user, 'is_active', False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account"
        )
    return current_user


# Utility function for token validation in routes
def validate_token_format(authorization: str) -> str:
    """
    Validate and extract token from Authorization header.
    
    Args:
        authorization: Authorization header value
        
    Returns:
        str: Extracted token
        
    Raises:
        HTTPException: If token format is invalid
    """
    if not authorization:
        raise credentials_exception
        
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise credentials_exception
        return token
    except ValueError:
        raise credentials_exception


# Example usage and testing functions (remove in production)
def create_test_token(username: str) -> str:
    """
    Create a test token for development/testing purposes.
    Remove this function in production.
    """
    return create_access_token(data={"sub": username})


# Security utilities
def is_token_expired(token: str) -> bool:
    """
    Check if a token is expired without raising exceptions.
    
    Args:
        token: JWT token to check
        
    Returns:
        bool: True if expired or invalid, False if valid
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        exp = payload.get("exp")
        if exp is None:
            return True
        return datetime.utcnow() > datetime.fromtimestamp(exp)
    except JWTError:
        return True


# Configuration validation function
def validate_auth_config() -> Dict[str, Any]:
    """
    Validate authentication configuration and return status.
    
    Returns:
        Dict containing configuration status
    """
    config_status = {
        "secret_key_set": bool(SECRET_KEY),
        "algorithm": ALGORITHM,
        "token_expire_hours": ACCESS_TOKEN_EXPIRE_HOURS,
        "bcrypt_rounds": pwd_context.bcrypt__rounds,
        "oauth2_token_url": oauth2_scheme.tokenUrl
    }
    
    return config_status


# Export main functions for easy importing
__all__ = [
    "create_access_token",
    "verify_token", 
    "get_password_hash",
    "verify_password",
    "get_current_user",
    "get_current_active_user",
    "oauth2_scheme",
    "credentials_exception"
]