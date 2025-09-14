"""
User model module for the application.

This module contains the User model class with authentication capabilities,
relationship definitions, and utility methods.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash

from core.database import Base


class User(Base):
    """
    User model representing application users.
    
    This model handles user authentication, profile information, and
    relationships with other entities in the system.
    
    Attributes:
        id (UUID): Unique identifier for the user
        email (str): User's email address (unique)
        password_hash (str): Hashed password for authentication
        name (str): User's display name
        is_active (bool): Whether the user account is active
        last_login (datetime): Timestamp of last login
        created_at (datetime): Account creation timestamp
        updated_at (datetime): Last modification timestamp
        tasks: Relationship to user's tasks
    """
    
    __tablename__ = "users"
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False
    )
    
    # User credentials and profile
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
    
    # User status and activity
    is_active = Column(
        Boolean,
        default=True,
        nullable=False
    )
    
    last_login = Column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    
    # Relationships
    tasks = relationship(
        "Task",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic"
    )
    
    # Database constraints
    __table_args__ = (
        Index('ix_users_email', 'email'),
    )
    
    def set_password(self, password: str) -> None:
        """
        Hash and store the user's password.
        
        Args:
            password (str): Plain text password to hash and store
            
        Raises:
            ValueError: If password is empty or None
            TypeError: If password is not a string
        """
        if not password:
            raise ValueError("Password cannot be empty or None")
        
        if not isinstance(password, str):
            raise TypeError("Password must be a string")
        
        try:
            self.password_hash = generate_password_hash(
                password,
                method='pbkdf2:sha256',
                salt_length=16
            )
        except Exception as e:
            raise RuntimeError(f"Failed to hash password: {str(e)}")
    
    def check_password(self, password: str) -> bool:
        """
        Verify a password against the stored hash.
        
        Args:
            password (str): Plain text password to verify
            
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
            # Log the exception in a real application
            return False
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the user instance to a dictionary representation.
        
        Returns:
            Dict[str, Any]: Dictionary containing user data (excluding password_hash)
        """
        return {
            'id': str(self.id),
            'email': self.email,
            'name': self.name,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def update_last_login(self) -> None:
        """
        Update the last_login timestamp to current time.
        """
        self.last_login = datetime.now(timezone.utc)
    
    def deactivate(self) -> None:
        """
        Deactivate the user account.
        """
        self.is_active = False
    
    def activate(self) -> None:
        """
        Activate the user account.
        """
        self.is_active = True
    
    def __repr__(self) -> str:
        """
        String representation of the User instance for debugging.
        
        Returns:
            str: String representation of the user
        """
        return (
            f"<User(id='{self.id}', email='{self.email}', "
            f"name='{self.name}', is_active={self.is_active})>"
        )
    
    def __str__(self) -> str:
        """
        Human-readable string representation of the User.
        
        Returns:
            str: User's name and email
        """
        return f"{self.name} ({self.email})"