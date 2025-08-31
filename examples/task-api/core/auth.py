"""
Authentication and authorization utilities module.

This module provides JWT token management, password hashing, and FastAPI
authentication dependencies for secure user authentication and authorization.
"""

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, status
from datetime import datetime, timedelta
import os
from typing import Optional
# from models.user import User


# Module-level constants
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
BCRYPT_ROUNDS = 12

# Environment variable validation
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is required for JWT token generation. "
        "Please set SECRET_KEY in your environment variables."
    )

# Configuration objects
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=BCRYPT_ROUNDS
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")


def create_access_token(data: dict) -> str:
    """
    Create a JWT access token with the provided data.
    
    Args:
        data (dict): The data to encode in the token. Should contain user
                    identification information.
    
    Returns:
        str: The encoded JWT token.
    
    Raises:
        ValueError: If data is empty or None.
        RuntimeError: If token creation fails.
    """
    if not data:
        raise ValueError("Token data cannot be empty")
    
    try:
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        to_encode.update({"exp": expire})
        
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        raise RuntimeError(f"Failed to create access token: {str(e)}")


def verify_token(token: str) -> Optional[str]:
    """
    Verify and decode a JWT token to extract the subject (username).
    
    Args:
        token (str): The JWT token to verify.
    
    Returns:
        Optional[str]: The username (subject) from the token if valid,
                      None if invalid or expired.
    """
    if not token or not isinstance(token, str):
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        
        if username is None:
            return None
            
        return username
    except JWTError:
        return None
    except Exception:
        return None


def get_password_hash(password: str) -> str:
    """
    Generate a bcrypt hash for the given password.
    
    Args:
        password (str): The plain text password to hash.
    
    Returns:
        str: The bcrypt hashed password.
    
    Raises:
        ValueError: If password is empty or None.
        RuntimeError: If hashing fails.
    """
    if not password:
        raise ValueError("Password cannot be empty")
    
    try:
        return pwd_context.hash(password)
    except Exception as e:
        raise RuntimeError(f"Failed to hash password: {str(e)}")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against its bcrypt hash using constant-time comparison.
    
    Args:
        plain_password (str): The plain text password to verify.
        hashed_password (str): The bcrypt hashed password to compare against.
    
    Returns:
        bool: True if the password matches the hash, False otherwise.
    """
    if not plain_password or not hashed_password:
        return False
    
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


async def get_current_user(token: str = Depends(oauth2_scheme)) -> "User":
    """
    FastAPI dependency to get the current authenticated user from JWT token.
    
    Args:
        token (str): The JWT token from the Authorization header.
    
    Returns:
        User: The authenticated user object.
    
    Raises:
        HTTPException: 401 if token is invalid or user not found.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        username = verify_token(token)
        if username is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception
    
    # Import here to avoid circular imports
    try:
        from models.user import User
    except ImportError:
        raise RuntimeError("User model not found. Please ensure models.user.User exists.")
    
    # This would typically query your database
    # For this implementation, we'll assume a get_user_by_username function exists
    try:
        user = await _get_user_by_username(username)
        if user is None:
            raise credentials_exception
        return user
    except Exception:
        raise credentials_exception


async def get_current_active_user(
    current_user: "User" = Depends(get_current_user)
) -> "User":
    """
    FastAPI dependency to get the current authenticated and active user.
    
    Args:
        current_user (User): The current authenticated user from get_current_user.
    
    Returns:
        User: The authenticated and active user object.
    
    Raises:
        HTTPException: 403 if user is inactive.
    """
    if not getattr(current_user, 'is_active', False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account"
        )
    return current_user


async def _get_user_by_username(username: str) -> Optional["User"]:
    """
    Internal helper function to retrieve user by username.
    
    This function should be implemented based on your database/ORM setup.
    This is a placeholder implementation that should be replaced with
    actual database queries.
    
    Args:
        username (str): The username to search for.
    
    Returns:
        Optional[User]: The user object if found, None otherwise.
    """
    # Import here to avoid circular imports
    try:
        from models.user import User
    except ImportError:
        return None
    
    # Placeholder implementation - replace with actual database query
    # Example for SQLAlchemy:
    # from database import get_db
    # db = next(get_db())
    # return db.query(User).filter(User.username == username).first()
    
    # Example for MongoDB with motor:
    # from database import get_database
    # db = await get_database()
    # user_data = await db.users.find_one({"username": username})
    # return User(**user_data) if user_data else None
    
    # For now, return None - this should be implemented based on your database
    return None


def create_user_token(user: "User") -> str:
    """
    Create an access token for a specific user.
    
    Args:
        user (User): The user object to create a token for.
    
    Returns:
        str: The JWT access token.
    
    Raises:
        ValueError: If user is None or missing required fields.
        RuntimeError: If token creation fails.
    """
    if not user:
        raise ValueError("User object cannot be None")
    
    username = getattr(user, 'username', None)
    if not username:
        raise ValueError("User must have a username field")
    
    token_data = {"sub": username}
    return create_access_token(data=token_data)


def validate_token_format(token: str) -> bool:
    """
    Validate the basic format of a JWT token without decoding.
    
    Args:
        token (str): The token to validate.
    
    Returns:
        bool: True if token has valid JWT format, False otherwise.
    """
    if not token or not isinstance(token, str):
        return False
    
    # JWT tokens have exactly 3 parts separated by dots
    parts = token.split('.')
    if len(parts) != 3:
        return False
    
    # Each part should be non-empty
    return all(part.strip() for part in parts)


class AuthenticationError(Exception):
    """Custom exception for authentication-related errors."""
    pass


class AuthorizationError(Exception):
    """Custom exception for authorization-related errors."""
    pass