"""
Authentication and Authorization Module

This module provides JWT token management and password handling functionality
for FastAPI applications. It includes secure password hashing, JWT token
creation/validation, and user authentication dependencies.

Security Features:
- BCrypt password hashing with 12 salt rounds
- JWT tokens with HS256 algorithm
- 24-hour token expiration
- Comprehensive error handling
- Input validation and sanitization

Rate Limiting Considerations:
- Consider implementing rate limiting on token endpoints
- Monitor failed authentication attempts
- Implement account lockout mechanisms for production use
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from jose import JWTError, jwt, ExpiredSignatureError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from models.user import User

# Configure logging
logger = logging.getLogger(__name__)

# Security Configuration Constants
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
BCRYPT_ROUNDS = 12

# Environment variable validation
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is required. "
        "Please set a secure secret key for JWT token signing."
    )

if len(SECRET_KEY) < 32:
    logger.warning(
        "SECRET_KEY should be at least 32 characters long for security. "
        "Current length: %d", len(SECRET_KEY)
    )

# Password hashing context with BCrypt
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=BCRYPT_ROUNDS
)

# OAuth2 scheme for token URL
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="token",
    description="JWT token for API authentication"
)


def create_access_token(
    data: Dict[str, Any], 
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT access token with the provided data.
    
    Args:
        data: Dictionary containing claims to encode in the token.
              Must include 'sub' (subject) claim for user identification.
        expires_delta: Optional custom expiration time. 
                      Defaults to ACCESS_TOKEN_EXPIRE_HOURS if not provided.
    
    Returns:
        str: Encoded JWT token string
        
    Raises:
        ValueError: If required claims are missing from data
        RuntimeError: If token encoding fails
        
    Example:
        >>> token = create_access_token({"sub": "user@example.com"})
        >>> # Token valid for 24 hours
    """
    if not isinstance(data, dict):
        raise ValueError("Token data must be a dictionary")
    
    if "sub" not in data:
        raise ValueError("Token data must include 'sub' (subject) claim")
    
    # Create a copy to avoid modifying the original data
    to_encode = data.copy()
    
    # Set expiration time
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    
    # Add expiration claim
    to_encode.update({"exp": expire})
    
    try:
        # Encode the JWT token
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        logger.info("Access token created for subject: %s", data.get("sub"))
        return encoded_jwt
    except Exception as e:
        logger.error("Failed to encode JWT token: %s", str(e))
        raise RuntimeError(f"Token encoding failed: {str(e)}") from e


def verify_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a JWT token.
    
    Args:
        token: JWT token string to validate
        
    Returns:
        dict: Decoded token payload containing claims
        
    Raises:
        HTTPException: 401 status for invalid, expired, or malformed tokens
        
    Example:
        >>> payload = verify_token("eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...")
        >>> user_email = payload.get("sub")
    """
    if not token or not isinstance(token, str):
        logger.warning("Invalid token format received")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        # Decode and validate the token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Validate required claims
        subject: str = payload.get("sub")
        if subject is None:
            logger.warning("Token missing subject claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.debug("Token successfully validated for subject: %s", subject)
        return payload
        
    except ExpiredSignatureError:
        logger.warning("Expired token received")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
        
    except JWTError as e:
        logger.warning("JWT validation error: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    
    except Exception as e:
        logger.error("Unexpected error during token validation: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token validation failed",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def get_password_hash(password: str) -> str:
    """
    Generate a secure hash for the given password using BCrypt.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        str: BCrypt hashed password string
        
    Raises:
        ValueError: If password is empty or invalid
        RuntimeError: If hashing operation fails
        
    Example:
        >>> hashed = get_password_hash("my_secure_password")
        >>> # Returns BCrypt hash string
    """
    if not password or not isinstance(password, str):
        raise ValueError("Password must be a non-empty string")
    
    if len(password.strip()) == 0:
        raise ValueError("Password cannot be empty or whitespace only")
    
    try:
        hashed_password = pwd_context.hash(password)
        logger.debug("Password successfully hashed")
        return hashed_password
    except Exception as e:
        logger.error("Password hashing failed: %s", str(e))
        raise RuntimeError(f"Password hashing failed: {str(e)}") from e


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against its BCrypt hash.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: BCrypt hashed password to compare against
        
    Returns:
        bool: True if password matches hash, False otherwise
        
    Raises:
        ValueError: If either parameter is invalid
        
    Example:
        >>> is_valid = verify_password("user_input", stored_hash)
        >>> if is_valid:
        ...     # Password is correct
    """
    if not plain_password or not isinstance(plain_password, str):
        raise ValueError("Plain password must be a non-empty string")
    
    if not hashed_password or not isinstance(hashed_password, str):
        raise ValueError("Hashed password must be a non-empty string")
    
    try:
        is_valid = pwd_context.verify(plain_password, hashed_password)
        logger.debug("Password verification completed")
        return is_valid
    except Exception as e:
        logger.error("Password verification error: %s", str(e))
        # Return False instead of raising exception for security
        # Don't reveal internal errors to potential attackers
        return False


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Extract and return the current user from JWT token.
    
    This dependency function validates the JWT token and retrieves
    the corresponding user from the database.
    
    Args:
        token: JWT token from OAuth2 scheme dependency
        
    Returns:
        User: User model instance for the authenticated user
        
    Raises:
        HTTPException: 401 status for invalid tokens or non-existent users
        
    Example:
        >>> # Use as FastAPI dependency
        >>> @app.get("/protected")
        >>> async def protected_route(user: User = Depends(get_current_user)):
        ...     return {"user_id": user.id}
    """
    # Validate and decode the token
    payload = verify_token(token)
    
    # Extract user identifier from token
    user_email: str = payload.get("sub")
    if not user_email:
        logger.warning("Token payload missing user identifier")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        # Retrieve user from database
        # Note: This assumes User.get_by_email() method exists
        # Adjust according to your User model implementation
        user = await User.get_by_email(user_email)
        
        if user is None:
            logger.warning("User not found for email: %s", user_email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.debug("Current user retrieved: %s", user_email)
        return user
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error("Database error while retrieving user: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Dependency to get current active user.
    
    This function ensures the authenticated user is also active/enabled.
    Useful for implementing user account suspension functionality.
    
    Args:
        current_user: User instance from get_current_user dependency
        
    Returns:
        User: Active user model instance
        
    Raises:
        HTTPException: 403 status if user account is disabled/inactive
        
    Example:
        >>> @app.get("/admin")
        >>> async def admin_route(user: User = Depends(get_current_active_user)):
        ...     return {"message": "Admin access granted"}
    """
    # Check if user has an 'is_active' attribute
    if hasattr(current_user, 'is_active') and not current_user.is_active:
        logger.warning("Inactive user attempted access: %s", current_user.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account"
        )
    
    # Check if user has an 'is_disabled' attribute
    if hasattr(current_user, 'is_disabled') and current_user.is_disabled:
        logger.warning("Disabled user attempted access: %s", current_user.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )
    
    logger.debug("Active user access granted: %s", current_user.email)
    return current_user


# Utility function for token expiration checking
def get_token_expiration(token: str) -> Optional[datetime]:
    """
    Extract expiration time from JWT token without full validation.
    
    Args:
        token: JWT token string
        
    Returns:
        datetime: Token expiration time, None if extraction fails
        
    Note:
        This function is for informational purposes only.
        Always use verify_token() for security-critical validation.
    """
    try:
        # Decode without verification to extract expiration
        unverified_payload = jwt.get_unverified_claims(token)
        exp_timestamp = unverified_payload.get("exp")
        
        if exp_timestamp:
            return datetime.fromtimestamp(exp_timestamp)
        return None
        
    except Exception as e:
        logger.debug("Could not extract token expiration: %s", str(e))
        return None


# Module initialization logging
logger.info(
    "Authentication module initialized - Algorithm: %s, "
    "Token expiration: %d hours, BCrypt rounds: %d",
    ALGORITHM, ACCESS_TOKEN_EXPIRE_HOURS, BCRYPT_ROUNDS
)