"""
User model module for SQLAlchemy ORM.

This module defines the User model with authentication capabilities,
proper password hashing, and database relationships.
"""

from sqlalchemy import Column, String, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import bcrypt
from typing import Optional, Dict, Any

from core.database import Base


class User(Base):
    """
    User model for authentication and user management.
    
    This model handles user authentication with secure password hashing,
    tracks user activity, and maintains relationships with other entities.
    """
    
    __tablename__ = "users"
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False
    )
    
    # User credentials and info
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
    
    # Database indexes
    __table_args__ = (
        Index('ix_users_email', 'email'),
        Index('ix_users_created_at', 'created_at'),
        Index('ix_users_is_active', 'is_active'),
    )
    
    def __repr__(self) -> str:
        """String representation of User instance for debugging."""
        return f"<User(id={self.id}, email='{self.email}', name='{self.name}')>"
    
    def set_password(self, password: str) -> None:
        """
        Hash and set the user's password.
        
        Args:
            password: Plain text password to hash and store
            
        Raises:
            ValueError: If password is empty or too short
            TypeError: If password is not a string
        """
        if not isinstance(password, str):
            raise TypeError("Password must be a string")
            
        if not password or len(password.strip()) == 0:
            raise ValueError("Password cannot be empty")
            
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
        # Generate salt and hash password with bcrypt
        # Using 12 rounds for good security/performance balance
        salt = bcrypt.gensalt(rounds=12)
        password_bytes = password.encode('utf-8')
        hashed = bcrypt.hashpw(password_bytes, salt)
        
        # Store the hash as a string
        self.password_hash = hashed.decode('utf-8')
    
    def check_password(self, password: str) -> bool:
        """
        Verify a password against the stored hash.
        
        Args:
            password: Plain text password to verify
            
        Returns:
            bool: True if password matches, False otherwise
        """
        if not isinstance(password, str):
            return False
            
        if not password or not self.password_hash:
            return False
        
        try:
            password_bytes = password.encode('utf-8')
            hash_bytes = self.password_hash.encode('utf-8')
            return bcrypt.checkpw(password_bytes, hash_bytes)
        except (ValueError, TypeError):
            # Handle any bcrypt errors gracefully
            return False
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert User instance to dictionary representation.
        
        Excludes sensitive information like password_hash and converts
        complex types to JSON-serializable formats.
        
        Returns:
            dict: Dictionary representation of the user
        """
        return {
            'id': str(self.id) if self.id else None,
            'email': self.email,
            'name': self.name,
            'is_active': self.is_active,
            'last_login': (
                self.last_login.isoformat() 
                if self.last_login else None
            ),
            'created_at': (
                self.created_at.isoformat() 
                if self.created_at else None
            ),
            'updated_at': (
                self.updated_at.isoformat() 
                if self.updated_at else None
            )
        }
    
    def update_last_login(self) -> None:
        """Update the last_login timestamp to current UTC time."""
        self.last_login = datetime.now(timezone.utc)
    
    def deactivate(self) -> None:
        """Deactivate the user account."""
        self.is_active = False
        self.updated_at = datetime.now(timezone.utc)
    
    def activate(self) -> None:
        """Activate the user account."""
        self.is_active = True
        self.updated_at = datetime.now(timezone.utc)
    
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
            is_active: Whether the user account is active
            
        Returns:
            User: New User instance with hashed password
            
        Raises:
            ValueError: If any required field is invalid
        """
        if not email or not email.strip():
            raise ValueError("Email is required")
            
        if not name or not name.strip():
            raise ValueError("Name is required")
        
        # Create user instance
        user = cls(
            email=email.strip().lower(),
            name=name.strip(),
            is_active=is_active
        )
        
        # Set password (this will validate and hash it)
        user.set_password(password)
        
        return user