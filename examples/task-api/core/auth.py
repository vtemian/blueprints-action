"""
Authentication and authorization utilities for FastAPI application.

This module provides JWT-based authentication with bcrypt password hashing,
OAuth2 bearer token authentication, and user dependency injection for FastAPI routes.
"""

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, status
from datetime import datetime, timedelta
import os
from typing import Optional, Dict, Any
import logging

# Import user model (assumed to exist)
from models import user as user_model

# Configure logging
logger = logging.getLogger(__name__)

# JWT Configuration Constants
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Security: Validate SECRET_KEY from environment
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is required for JWT authentication. "
        "Please set a secure secret key in your environment variables."
    )

# Password hashing configuration with bcrypt and 12 salt rounds
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12
)

# OAuth2 scheme configuration for FastAPI
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# Exception for credential validation failures
credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token with the provided data payload.
    
    Args:
        data (dict): The payload data to encode in the token
        expires_delta (timedelta, optional): Custom expiration time. 
                                           Defaults to 24 hours if not provided.
    
    Returns:
        str: Encoded JWT token
        
    Raises:
        ValueError: If data is empty or invalid
    """
    if not data:
        raise ValueError("Token data cannot be empty")
    
    # Create a copy to avoid modifying the original data
    to_encode = data.copy()
    
    # Set token expiration time
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    
    # Add expiration and issued at claims
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow()
    })
    
    # Security: Ensure 'sub' field exists for user identification
    if "sub" not in to_encode:
        logger.warning("Token created without 'sub' field - this may cause authentication issues")
    
    try:
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        logger.info(f"Access token created for subject: {to_encode.get('sub', 'unknown')}")
        return encoded_jwt
    except Exception as e:
        logger.error(f"Failed to create access token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create access token"
        )


def verify_token(token: str) -> Dict[str, Any]:
    """
    Verify and decode a JWT token.
    
    Args:
        token (str): The JWT token to verify
        
    Returns:
        dict: Decoded token payload
        
    Raises:
        HTTPException: If token is invalid, expired, or malformed
    """
    if not token:
        logger.warning("Empty token provided for verification")
        raise credentials_exception
    
    try:
        # Decode and verify the token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Validate required fields
        username: str = payload.get("sub")
        if username is None:
            logger.warning("Token missing 'sub' field")
            raise credentials_exception
            
        # Additional validation: check if token has expired (jose handles this automatically)
        exp = payload.get("exp")
        if exp and datetime.utcnow() > datetime.fromtimestamp(exp):
            logger.warning(f"Expired token used by user: {username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.debug(f"Token successfully verified for user: {username}")
        return payload
        
    except JWTError as e:
        logger.warning(f"JWT verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {str(e)}")
        raise credentials_exception


def get_password_hash(password: str) -> str:
    """
    Hash a plain text password using bcrypt.
    
    Args:
        password (str): Plain text password to hash
        
    Returns:
        str: Bcrypt hashed password
        
    Raises:
        ValueError: If password is empty or invalid
    """
    if not password:
        raise ValueError("Password cannot be empty")
    
    if len(password.strip()) == 0:
        raise ValueError("Password cannot be only whitespace")
    
    try:
        hashed = pwd_context.hash(password)
        logger.debug("Password successfully hashed")
        return hashed
    except Exception as e:
        logger.error(f"Failed to hash password: {str(e)}")
        raise ValueError("Failed to hash password")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password.
    
    Args:
        plain_password (str): Plain text password to verify
        hashed_password (str): Hashed password to compare against
        
    Returns:
        bool: True if password matches, False otherwise
    """
    if not plain_password or not hashed_password:
        logger.warning("Empty password or hash provided for verification")
        return False
    
    try:
        is_valid = pwd_context.verify(plain_password, hashed_password)
        if is_valid:
            logger.debug("Password verification successful")
        else:
            logger.debug("Password verification failed")
        return is_valid
    except Exception as e:
        logger.error(f"Error during password verification: {str(e)}")
        return False


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    FastAPI dependency to get the current authenticated user from JWT token.
    
    Args:
        token (str): JWT token from OAuth2 bearer scheme
        
    Returns:
        User: Current authenticated user object
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    try:
        # Verify and decode the token
        payload = verify_token(token)
        username: str = payload.get("sub")
        
        if username is None:
            logger.warning("Token payload missing username")
            raise credentials_exception
        
        # Fetch user from database
        user = await user_model.get_user_by_username(username)
        if user is None:
            logger.warning(f"User not found in database: {username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.debug(f"Current user retrieved: {username}")
        return user
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Unexpected error retrieving current user: {str(e)}")
        raise credentials_exception


async def get_current_active_user(current_user = Depends(get_current_user)):
    """
    FastAPI dependency to get the current active user.
    
    Args:
        current_user: Current user from get_current_user dependency
        
    Returns:
        User: Current active user object
        
    Raises:
        HTTPException: If user is inactive/disabled
    """
    # Check if user has an 'is_active' attribute and if it's False
    if hasattr(current_user, 'is_active') and not current_user.is_active:
        logger.warning(f"Inactive user attempted access: {getattr(current_user, 'username', 'unknown')}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account"
        )
    
    # Check alternative attribute names for user status
    if hasattr(current_user, 'disabled') and current_user.disabled:
        logger.warning(f"Disabled user attempted access: {getattr(current_user, 'username', 'unknown')}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is disabled"
        )
    
    logger.debug(f"Active user verified: {getattr(current_user, 'username', 'unknown')}")
    return current_user


# Utility function for token data creation
def create_token_data(username: str, additional_claims: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Helper function to create standardized token data.
    
    Args:
        username (str): Username to include in token
        additional_claims (dict, optional): Additional claims to include
        
    Returns:
        dict: Token data ready for encoding
    """
    token_data = {"sub": username}
    
    if additional_claims:
        token_data.update(additional_claims)
    
    return token_data


# Security utility for validating token format
def is_valid_token_format(token: str) -> bool:
    """
    Basic validation of JWT token format without decoding.
    
    Args:
        token (str): Token to validate format
        
    Returns:
        bool: True if token has valid JWT format
    """
    if not token:
        return False
    
    # JWT tokens have 3 parts separated by dots
    parts = token.split('.')
    return len(parts) == 3 and all(part for part in parts)