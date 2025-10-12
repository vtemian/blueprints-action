"""
User model for SQLAlchemy-based application.

This module defines the User model with secure password handling,
proper relationships, and comprehensive validation.
"""

import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import Column, String, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from werkzeug.security import generate_password_hash, check_password_hash

from core.database import Base


class User(Base):
    """
    User model representing application users.
    
    Provides secure password handling, user management functionality,
    and relationships with other models.
    """
    
    __tablename__ = "users"
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
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
        nullable=False
    )
    
    last_login = Column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Timestamps
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
    
    # Database constraints
    __table_args__ = (
        Index('ix_users_email', 'email'),
        Index('ix_users_created_at', 'created_at'),
    )
    
    def __init__(self, email: str, name: str, password: str, **kwargs) -> None:
        """
        Initialize a new User instance.
        
        Args:
            email: User's email address
            name: User's full name
            password: Plain text password (will be hashed)
            **kwargs: Additional keyword arguments
        """
        super().__init__(**kwargs)
        self.email = email.lower().strip()
        self.name = name.strip()
        self.set_password(password)
    
    def set_password(self, password: str) -> None:
        """
        Set user password with secure hashing.
        
        Args:
            password: Plain text password to hash and store
            
        Raises:
            ValueError: If password is empty or invalid
            RuntimeError: If password hashing fails
        """
        if not password or not isinstance(password, str):
            raise ValueError("Password must be a non-empty string")
        
        if len(password.strip()) < 1:
            raise ValueError("Password cannot be empty or whitespace only")
        
        try:
            self.password_hash = generate_password_hash(
                password,
                method='pbkdf2:sha256',
                salt_length=16
            )
        except Exception as e:
            raise RuntimeError(f"Failed to hash password: {str(e)}") from e
    
    def check_password(self, password: str) -> bool:
        """
        Verify password against stored hash.
        
        Args:
            password: Plain text password to verify
            
        Returns:
            bool: True if password matches, False otherwise
            
        Raises:
            ValueError: If password is invalid type
            RuntimeError: If password verification fails
        """
        if not password or not isinstance(password, str):
            raise ValueError("Password must be a non-empty string")
        
        if not self.password_hash:
            return False
        
        try:
            return check_password_hash(self.password_hash, password)
        except Exception as e:
            raise RuntimeError(f"Failed to verify password: {str(e)}") from e
    
    def update_last_login(self) -> None:
        """Update the last_login timestamp to current time."""
        self.last_login = func.now()
    
    def deactivate(self) -> None:
        """Deactivate the user account."""
        self.is_active = False
    
    def activate(self) -> None:
        """Activate the user account."""
        self.is_active = True
    
    def to_dict(self, include_timestamps: bool = True) -> Dict[str, Any]:
        """
        Convert user instance to dictionary representation.
        
        Args:
            include_timestamps: Whether to include created_at/updated_at
            
        Returns:
            Dict containing user data (excluding password_hash)
        """
        user_dict = {
            'id': str(self.id),
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
    
    def to_public_dict(self) -> Dict[str, Any]:
        """
        Convert user to public dictionary (minimal information).
        
        Returns:
            Dict containing only public user information
        """
        return {
            'id': str(self.id),
            'name': self.name,
            'is_active': self.is_active,
        }
    
    @classmethod
    def find_by_email(cls, session, email: str) -> Optional['User']:
        """
        Find user by email address.
        
        Args:
            session: SQLAlchemy session
            email: Email address to search for
            
        Returns:
            User instance if found, None otherwise
        """
        if not email or not isinstance(email, str):
            return None
        
        return session.query(cls).filter(
            cls.email == email.lower().strip()
        ).first()
    
    @classmethod
    def find_active_by_email(cls, session, email: str) -> Optional['User']:
        """
        Find active user by email address.
        
        Args:
            session: SQLAlchemy session
            email: Email address to search for
            
        Returns:
            Active User instance if found, None otherwise
        """
        if not email or not isinstance(email, str):
            return None
        
        return session.query(cls).filter(
            cls.email == email.lower().strip(),
            cls.is_active == True
        ).first()
    
    def __repr__(self) -> str:
        """String representation of User instance."""
        return f"<User(id='{self.id}', email='{self.email}', name='{self.name}')>"
    
    def __str__(self) -> str:
        """Human-readable string representation."""
        return f"{self.name} ({self.email})"