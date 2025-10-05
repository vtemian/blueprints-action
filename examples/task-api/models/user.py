"""
User model for authentication and user management.

This module defines the User SQLAlchemy model with authentication features
including password hashing, validation, and serialization methods.
"""

import uuid
from datetime import datetime
from typing import Dict, Any, Optional

import bcrypt
from sqlalchemy import Column, String, Boolean, DateTime, UUID, Index
from sqlalchemy.orm import relationship

from core.database import Base


class User(Base):
    """
    User model for authentication and user management.
    
    This model handles user authentication with bcrypt password hashing,
    user profile information, and activity tracking.
    """
    
    __tablename__ = "users"
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False
    )
    
    # Authentication fields
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
    
    # Profile fields
    name = Column(
        String(100),
        nullable=False
    )
    
    # Status and activity tracking
    is_active = Column(
        Boolean,
        default=True,
        nullable=False
    )
    
    last_login = Column(
        DateTime,
        nullable=True
    )
    
    # Timestamps
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
    
    # Relationships
    tasks = relationship("Task", back_populates="user")
    
    # Table constraints and indexes
    __table_args__ = (
        Index('ix_users_email', 'email'),
        Index('ix_users_is_active', 'is_active'),
        Index('ix_users_created_at', 'created_at'),
    )
    
    def set_password(self, password: str) -> None:
        """
        Hash and set the user's password using bcrypt.
        
        Args:
            password: Plain text password to hash and store
            
        Raises:
            ValueError: If password is empty or None
            RuntimeError: If bcrypt hashing fails
        """
        if not password:
            raise ValueError("Password cannot be empty")
        
        try:
            # Generate salt and hash password
            salt = bcrypt.gensalt()
            password_bytes = password.encode('utf-8')
            hashed = bcrypt.hashpw(password_bytes, salt)
            
            # Store the hash as a string
            self.password_hash = hashed.decode('utf-8')
            
        except Exception as e:
            raise RuntimeError(f"Failed to hash password: {str(e)}")
    
    def check_password(self, password: str) -> bool:
        """
        Verify a password against the stored hash using bcrypt.
        
        Args:
            password: Plain text password to verify
            
        Returns:
            bool: True if password matches, False otherwise
        """
        if not password or not self.password_hash:
            return False
        
        try:
            password_bytes = password.encode('utf-8')
            hash_bytes = self.password_hash.encode('utf-8')
            
            return bcrypt.checkpw(password_bytes, hash_bytes)
            
        except Exception:
            # Log the exception in production, but don't expose details
            return False
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the user model to a dictionary representation.
        
        Excludes sensitive information like password_hash and converts
        UUID and datetime objects to strings for JSON serialization.
        
        Returns:
            dict: Dictionary representation of the user
        """
        return {
            'id': str(self.id),
            'email': self.email,
            'name': self.name,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def update_last_login(self) -> None:
        """
        Update the last_login timestamp to current UTC time.
        
        This method should be called when the user successfully authenticates.
        """
        self.last_login = datetime.utcnow()
    
    def deactivate(self) -> None:
        """
        Deactivate the user account.
        
        Sets is_active to False, which can be used to prevent login
        without deleting the user record.
        """
        self.is_active = False
    
    def activate(self) -> None:
        """
        Activate the user account.
        
        Sets is_active to True, allowing the user to login.
        """
        self.is_active = True
    
    def __repr__(self) -> str:
        """String representation of the User model."""
        return f"<User(id={self.id}, email='{self.email}', name='{self.name}')>"
    
    def __str__(self) -> str:
        """Human-readable string representation of the User model."""
        return f"{self.name} ({self.email})"