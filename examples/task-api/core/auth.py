"""
Authentication and Authorization Module

This module provides comprehensive JWT token management, password hashing,
and FastAPI integration for secure user authentication and authorization.

Author: Production Team
Version: 1.0.0
"""

import os
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Union

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt, ExpiredSignatureError, JWTClaimsError
from passlib.context import CryptContext
from passlib.exc import InvalidHashError, UnknownHashError
from pydantic import ValidationError

from models.user import User


# =============================================================================
# Configuration and Constants
# =============================================================================

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    # Generate a secure random key for development/testing
    # In production, this should always be set via environment variable
    SECRET_KEY = secrets.token_urlsafe(32)
    print("WARNING: Using auto-generated JWT secret key. Set JWT_SECRET_KEY environment variable for production.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Password hashing configuration
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12
)

# OAuth2 scheme for FastAPI
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="auth/token",
    scheme_name="JWT"
)


# =============================================================================
# JWT Token Management
# =============================================================================

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generate a JWT access token with proper payload structure.
    
    Args:
        data: Dictionary containing user data to encode in token
        expires_delta: Optional custom expiration time
        
    Returns:
        str: Encoded JWT token
        
    Raises:
        ValueError: If required data is missing
        JWTError: If token creation fails
    """
    try:
        if not data:
            raise ValueError("Token data cannot be empty")
            
        # Create a copy of the data to avoid modifying the original
        to_encode = data.copy()
        
        # Set expiration time
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
            
        # Add standard JWT claims
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access_token"
        })
        
        # Ensure required fields are present
        if "sub" not in to_encode:
            raise ValueError("Token data must include 'sub' (subject) field")
            
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
        
    except (ValueError, TypeError) as e:
        raise ValueError(f"Invalid token data: {str(e)}")
    except Exception as e:
        raise JWTError(f"Token creation failed: {str(e)}")


def verify_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate JWT token with comprehensive error handling.
    
    Args:
        token: JWT token string to verify
        
    Returns:
        Dict[str, Any]: Decoded token payload
        
    Raises:
        HTTPException: With appropriate status codes for different error types
    """
    try:
        if not token or not isinstance(token, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token format",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        # Decode the JWT token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Validate token type
        token_type = payload.get("type")
        if token_type != "access_token":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        # Validate required claims
        if not payload.get("sub"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing required claims",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return payload
        
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTClaimsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        # Log unexpected errors (in production, use proper logging)
        print(f"Unexpected error in token verification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token verification failed",
        )


# =============================================================================
# Password Management
# =============================================================================

def get_password_hash(password: str) -> str:
    """
    Hash password using bcrypt with 12 salt rounds.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        str: Bcrypt hashed password
        
    Raises:
        ValueError: If password is invalid
        RuntimeError: If hashing fails
    """
    try:
        if not password or not isinstance(password, str):
            raise ValueError("Password must be a non-empty string")
            
        if len(password.strip()) == 0:
            raise ValueError("Password cannot be empty or whitespace only")
            
        # Hash the password
        hashed = pwd_context.hash(password)
        
        if not hashed:
            raise RuntimeError("Password hashing failed")
            
        return hashed
        
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(f"Password hashing failed: {str(e)}")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify password against bcrypt hash with proper exception handling.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Bcrypt hashed password to verify against
        
    Returns:
        bool: True if password matches, False otherwise
        
    Raises:
        ValueError: If inputs are invalid
        RuntimeError: If verification process fails
    """
    try:
        if not plain_password or not isinstance(plain_password, str):
            raise ValueError("Plain password must be a non-empty string")
            
        if not hashed_password or not isinstance(hashed_password, str):
            raise ValueError("Hashed password must be a non-empty string")
            
        # Verify the password
        is_valid = pwd_context.verify(plain_password, hashed_password)
        return bool(is_valid)
        
    except (InvalidHashError, UnknownHashError):
        # Invalid hash format - return False rather than raising
        return False
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(f"Password verification failed: {str(e)}")


# =============================================================================
# FastAPI Dependencies
# =============================================================================

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Extract and validate user from JWT token.
    
    This dependency extracts the user information from a valid JWT token
    and returns the user object. It handles token validation and user lookup.
    
    Args:
        token: JWT token from OAuth2PasswordBearer dependency
        
    Returns:
        User: Authenticated user object
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    try:
        # Verify and decode the token
        payload = verify_token(token)
        
        # Extract user identifier from token
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        # Get user from database
        # Note: This assumes User.get_by_id() method exists
        # In a real application, you might need to inject a database session
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
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        # Log unexpected errors (use proper logging in production)
        print(f"Unexpected error in get_current_user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service unavailable",
        )


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Additional dependency to verify user account status.
    
    This dependency builds on get_current_user to also verify that the user
    account is active and not disabled or suspended.
    
    Args:
        current_user: User object from get_current_user dependency
        
    Returns:
        User: Active user object
        
    Raises:
        HTTPException: If user account is inactive
    """
    try:
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required"
            )
            
        # Check if user account is active
        # Assuming User model has is_active attribute
        if not getattr(current_user, 'is_active', True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Inactive user account"
            )
            
        # Check if user account is verified (if applicable)
        if hasattr(current_user, 'is_verified') and not current_user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account not verified"
            )
            
        return current_user
        
    except HTTPException:
        raise
    except Exception as e:
        # Log unexpected errors (use proper logging in production)
        print(f"Unexpected error in get_current_active_user: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User validation service unavailable",
        )


# =============================================================================
# Utility Functions
# =============================================================================

def create_user_token(user: User) -> str:
    """
    Create an access token for a specific user.
    
    Args:
        user: User object to create token for
        
    Returns:
        str: JWT access token
        
    Raises:
        ValueError: If user is invalid
        JWTError: If token creation fails
    """
    if not user:
        raise ValueError("User object is required")
        
    # Prepare token data
    token_data = {
        "sub": str(user.id),
        "email": getattr(user, 'email', ''),
        "username": getattr(user, 'username', ''),
    }
    
    # Add additional user claims if available
    if hasattr(user, 'role'):
        token_data["role"] = user.role
        
    if hasattr(user, 'permissions'):
        token_data["permissions"] = user.permissions
        
    return create_access_token(token_data)


def decode_token_payload(token: str) -> Optional[Dict[str, Any]]:
    """
    Safely decode token payload without raising HTTP exceptions.
    
    This is useful for internal operations where you want to extract
    token information without triggering HTTP error responses.
    
    Args:
        token: JWT token to decode
        
    Returns:
        Optional[Dict[str, Any]]: Token payload or None if invalid
    """
    try:
        return verify_token(token)
    except HTTPException:
        return None
    except Exception:
        return None


# =============================================================================
# Module Initialization
# =============================================================================

__all__ = [
    'create_access_token',
    'verify_token',
    'get_password_hash',
    'verify_password',
    'get_current_user',
    'get_current_active_user',
    'oauth2_scheme',
    'create_user_token',
    'decode_token_payload',
]

# Validate configuration on module import
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY environment variable is required")

if len(SECRET_KEY) < 32:
    print("WARNING: JWT secret key should be at least 32 characters long")