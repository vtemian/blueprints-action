"""
User model definition with authentication capabilities.

This module contains the User model with SQLAlchemy ORM mapping,
authentication methods, and relationship definitions.
"""

import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import Column, String, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash

from core.database import db


class User(db.Model):
    """
    User model with authentication capabilities.
    
    Represents a user in the system with email-based authentication,
    password hashing, and activity tracking.
    """
    
    __tablename__ = 'users'
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False
    )
    
    # User credentials and information
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
    tasks = relationship(
        "Task",
        back_populates="user",
        lazy="dynamic",
        cascade="all, delete-orphan"
    )
    
    # Indexes
    __table_args__ = (
        Index('ix_users_email', 'email'),
        Index('ix_users_created_at', 'created_at'),
        Index('ix_users_is_active', 'is_active'),
    )
    
    def __init__(self, email: str, name: str, password: str = None, **kwargs):
        """
        Initialize a new User instance.
        
        Args:
            email: User's email address
            name: User's display name
            password: Plain text password (will be hashed)
            **kwargs: Additional keyword arguments
        """
        super().__init__(**kwargs)
        self.email = email.lower().strip() if email else None
        self.name = name.strip() if name else None
        
        if password:
            self.set_password(password)
    
    def set_password(self, password: str) -> None:
        """
        Hash and store a password.
        
        Uses werkzeug's security utilities to generate a secure password hash
        with salt. The hash is stored in the password_hash field.
        
        Args:
            password: Plain text password to hash
            
        Raises:
            ValueError: If password is empty or None
        """
        if not password or not password.strip():
            raise ValueError("Password cannot be empty")
        
        self.password_hash = generate_password_hash(
            password.strip(),
            method='pbkdf2:sha256',
            salt_length=16
        )
    
    def check_password(self, password: str) -> bool:
        """
        Verify a password against the stored hash.
        
        Args:
            password: Plain text password to verify
            
        Returns:
            bool: True if password matches, False otherwise
            
        Raises:
            ValueError: If password is None or password_hash is not set
        """
        if not password:
            raise ValueError("Password cannot be None")
        
        if not self.password_hash:
            raise ValueError("No password hash set for user")
        
        return check_password_hash(self.password_hash, password.strip())
    
    def to_dict(self, include_relationships: bool = False) -> Dict[str, Any]:
        """
        Convert user instance to dictionary representation.
        
        Excludes sensitive information like password_hash from the output.
        Converts UUID and datetime objects to string representations.
        
        Args:
            include_relationships: Whether to include related objects
            
        Returns:
            Dict[str, Any]: Dictionary representation of the user
        """
        user_dict = {
            'id': str(self.id),
            'email': self.email,
            'name': self.name,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
        
        if include_relationships:
            user_dict['tasks_count'] = self.tasks.count()
        
        return user_dict
    
    def update_last_login(self) -> None:
        """
        Update the last_login timestamp to current UTC time.
        
        This method should be called when a user successfully authenticates.
        """
        self.last_login = datetime.utcnow()
    
    def deactivate(self) -> None:
        """
        Deactivate the user account.
        
        Sets is_active to False, preventing the user from logging in
        while preserving their data.
        """
        self.is_active = False
    
    def activate(self) -> None:
        """
        Activate the user account.
        
        Sets is_active to True, allowing the user to log in.
        """
        self.is_active = True
    
    @classmethod
    def find_by_email(cls, email: str) -> Optional['User']:
        """
        Find a user by email address.
        
        Args:
            email: Email address to search for
            
        Returns:
            Optional[User]: User instance if found, None otherwise
        """
        if not email:
            return None
        
        return cls.query.filter_by(email=email.lower().strip()).first()
    
    @classmethod
    def find_active_by_email(cls, email: str) -> Optional['User']:
        """
        Find an active user by email address.
        
        Args:
            email: Email address to search for
            
        Returns:
            Optional[User]: Active user instance if found, None otherwise
        """
        if not email:
            return None
        
        return cls.query.filter_by(
            email=email.lower().strip(),
            is_active=True
        ).first()
    
    def __repr__(self) -> str:
        """
        String representation of the User instance.
        
        Returns:
            str: String representation showing id and email
        """
        return f'<User {self.id}: {self.email}>'
    
    def __str__(self) -> str:
        """
        Human-readable string representation.
        
        Returns:
            str: User's name and email
        """
        return f'{self.name} ({self.email})'