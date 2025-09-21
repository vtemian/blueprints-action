"""
User model module for SQLAlchemy ORM with authentication features.

This module provides a complete User model with secure password handling,
proper database constraints, and serialization methods.
"""

from datetime import datetime
from typing import Dict, Any, Optional
import uuid
from uuid import uuid4

from sqlalchemy import (
    Column, String, Boolean, DateTime, Text, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash

from .base import Base  # Assuming Base is defined in a base module


class User(Base):
    """
    User model with authentication capabilities.
    
    Provides secure password hashing, user management, and proper
    database relationships for a complete user authentication system.
    """
    
    __tablename__ = "users"
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=func.gen_random_uuid(),
        nullable=False
    )
    
    # User credentials and basic info
    email = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True
    )
    
    password_hash = Column(
        String(255),
        nullable=False
    )
    
    name = Column(
        String(100),
        nullable=False
    )
    
    # User status and activity tracking
    is_active = Column(
        Boolean,
        default=True,
        server_default='true',
        nullable=False
    )
    
    last_login = Column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Timestamp fields
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    tasks = relationship(
        "Task",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )
    
    # Indexes
    __table_args__ = (
        Index('idx_users_email', 'email'),
        Index('idx_users_active', 'is_active'),
        Index('idx_users_created_at', 'created_at'),
    )
    
    def __repr__(self) -> str:
        """String representation of User instance."""
        return f"<User(id={self.id}, email='{self.email}', name='{self.name}')>"
    
    def set_password(self, password: str) -> None:
        """
        Hash and store a password securely.
        
        Args:
            password: Plain text password to hash and store
            
        Raises:
            ValueError: If password is invalid or hashing fails
            TypeError: If password is not a string
        """
        if not isinstance(password, str):
            raise TypeError("Password must be a string")
        
        if not password:
            raise ValueError("Password cannot be empty")
        
        # Basic password strength validation
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
        try:
            # Use werkzeug's secure password hashing with salt
            self.password_hash = generate_password_hash(
                password,
                method='pbkdf2:sha256',
                salt_length=16
            )
        except Exception as e:
            raise ValueError(f"Failed to hash password: {str(e)}")
    
    def check_password(self, password: str) -> bool:
        """
        Verify a password against the stored hash.
        
        Args:
            password: Plain text password to verify
            
        Returns:
            bool: True if password matches, False otherwise
            
        Raises:
            TypeError: If password is not a string
        """
        if not isinstance(password, str):
            raise TypeError("Password must be a string")
        
        if not password or not self.password_hash:
            return False
        
        try:
            return check_password_hash(self.password_hash, password)
        except Exception:
            # Log the error in production, but don't expose details
            return False
    
    def update_last_login(self) -> None:
        """Update the last_login timestamp to current time."""
        self.last_login = datetime.utcnow()
    
    def deactivate(self) -> None:
        """Deactivate the user account."""
        self.is_active = False
    
    def activate(self) -> None:
        """Activate the user account."""
        self.is_active = True
    
    def to_dict(self, include_timestamps: bool = True) -> Dict[str, Any]:
        """
        Convert User instance to dictionary representation.
        
        Args:
            include_timestamps: Whether to include created_at/updated_at fields
            
        Returns:
            dict: Dictionary representation of user (excluding password_hash)
            
        Note:
            password_hash is never included for security reasons
        """
        try:
            user_dict = {
                'id': str(self.id) if self.id else None,
                'email': self.email,
                'name': self.name,
                'is_active': self.is_active,
                'last_login': self.last_login.isoformat() if self.last_login else None,
            }
            
            if include_timestamps:
                user_dict.update({
                    'created_at': self.created_at.isoformat() if self.created_at else None,
                    'updated_at': self.updated_at.isoformat() if self.updated_at else None,
                })
            
            return user_dict
            
        except Exception as e:
            # Handle serialization errors gracefully
            raise ValueError(f"Failed to serialize user data: {str(e)}")
    
    def to_public_dict(self) -> Dict[str, Any]:
        """
        Convert User instance to public dictionary representation.
        
        Returns only safe, public fields suitable for API responses.
        
        Returns:
            dict: Public dictionary representation of user
        """
        try:
            return {
                'id': str(self.id) if self.id else None,
                'name': self.name,
                'email': self.email,
                'is_active': self.is_active,
            }
        except Exception as e:
            raise ValueError(f"Failed to serialize public user data: {str(e)}")
    
    @classmethod
    def create_user(
        cls,
        email: str,
        password: str,
        name: str,
        is_active: bool = True
    ) -> 'User':
        """
        Class method to create a new user with proper validation.
        
        Args:
            email: User's email address
            password: Plain text password
            name: User's display name
            is_active: Whether user should be active (default: True)
            
        Returns:
            User: New User instance with hashed password
            
        Raises:
            ValueError: If any validation fails
        """
        if not email or not isinstance(email, str):
            raise ValueError("Valid email is required")
        
        if not name or not isinstance(name, str):
            raise ValueError("Valid name is required")
        
        # Basic email validation
        if '@' not in email or len(email) > 255:
            raise ValueError("Invalid email format")
        
        # Create user instance
        user = cls(
            email=email.lower().strip(),
            name=name.strip(),
            is_active=is_active
        )
        
        # Set password (this will validate and hash it)
        user.set_password(password)
        
        return user
    
    def update_profile(
        self,
        name: Optional[str] = None,
        email: Optional[str] = None
    ) -> None:
        """
        Update user profile information.
        
        Args:
            name: New name (optional)
            email: New email (optional)
            
        Raises:
            ValueError: If validation fails
        """
        if name is not None:
            if not isinstance(name, str) or not name.strip():
                raise ValueError("Valid name is required")
            self.name = name.strip()
        
        if email is not None:
            if not isinstance(email, str) or '@' not in email or len(email) > 255:
                raise ValueError("Invalid email format")
            self.email = email.lower().strip()