"""
User model module for SQLAlchemy-based application.

This module defines the User model with authentication capabilities,
proper relationships, and comprehensive error handling.
"""

import re
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List

from sqlalchemy import (
    String, Boolean, DateTime, Index, UniqueConstraint,
    CheckConstraint, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.security import generate_password_hash, check_password_hash

from core.database import Base


class User(Base):
    """
    User model representing application users with authentication capabilities.
    
    This model handles user authentication, profile information, and maintains
    relationships with other entities in the system.
    
    Attributes:
        id: Unique identifier for the user
        email: User's email address (unique)
        password_hash: Hashed password for authentication
        name: User's display name
        is_active: Whether the user account is active
        last_login: Timestamp of last successful login
        created_at: Account creation timestamp
        updated_at: Last modification timestamp
        tasks: Related tasks owned by this user
    """
    
    __tablename__ = "users"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False
    )
    
    # User credentials and profile
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True
    )
    
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )
    
    # User status and activity
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )
    
    last_login: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    tasks: Mapped[List["Task"]] = relationship(
        "Task",
        back_populates="user",
        lazy="select",
        cascade="all, delete-orphan"
    )
    
    # Table constraints
    __table_args__ = (
        UniqueConstraint('email', name='uq_users_email'),
        Index('ix_users_email_active', 'email', 'is_active'),
        CheckConstraint(
            "email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'",
            name='ck_users_email_format'
        ),
        CheckConstraint(
            "char_length(name) >= 1",
            name='ck_users_name_not_empty'
        ),
    )
    
    def set_password(self, password: str) -> None:
        """
        Hash and set the user's password.
        
        Args:
            password: Plain text password to hash and store
            
        Raises:
            ValueError: If password is None, empty, or too short
            RuntimeError: If password hashing fails
        """
        if password is None:
            raise ValueError("Password cannot be None")
        
        if not isinstance(password, str):
            raise ValueError("Password must be a string")
        
        if len(password.strip()) == 0:
            raise ValueError("Password cannot be empty")
        
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
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
        Verify a password against the stored hash.
        
        Args:
            password: Plain text password to verify
            
        Returns:
            bool: True if password matches, False otherwise
            
        Raises:
            ValueError: If password is None or not a string
        """
        if password is None:
            raise ValueError("Password cannot be None")
        
        if not isinstance(password, str):
            raise ValueError("Password must be a string")
        
        if not self.password_hash:
            return False
        
        try:
            return check_password_hash(self.password_hash, password)
        except Exception:
            # Log the exception in production, but don't expose details
            return False
    
    def to_dict(self, include_relationships: bool = False) -> Dict[str, Any]:
        """
        Convert user instance to dictionary representation.
        
        Args:
            include_relationships: Whether to include related objects
            
        Returns:
            Dict containing user data (excluding password_hash)
        """
        user_dict = {
            'id': str(self.id),
            'email': self.email,
            'name': self.name,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }
        
        if include_relationships and self.tasks:
            user_dict['tasks'] = [
                {
                    'id': str(task.id),
                    'title': task.title,
                    'status': task.status
                }
                for task in self.tasks
            ]
        
        return user_dict
    
    def update_last_login(self) -> None:
        """Update the last_login timestamp to current time."""
        self.last_login = datetime.utcnow()
    
    def deactivate(self) -> None:
        """Deactivate the user account."""
        self.is_active = False
    
    def activate(self) -> None:
        """Activate the user account."""
        self.is_active = True
    
    @classmethod
    def find_by_email(cls, email: str) -> Optional["User"]:
        """
        Find a user by email address.
        
        Args:
            email: Email address to search for
            
        Returns:
            User instance if found, None otherwise
        """
        from core.database import get_session
        
        if not email or not isinstance(email, str):
            return None
        
        try:
            with get_session() as session:
                return session.query(cls).filter(
                    cls.email == email.lower().strip()
                ).first()
        except SQLAlchemyError:
            return None
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """
        Validate email format.
        
        Args:
            email: Email address to validate
            
        Returns:
            bool: True if email format is valid
        """
        if not email or not isinstance(email, str):
            return False
        
        email_pattern = r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
        return bool(re.match(email_pattern, email.strip()))
    
    def __repr__(self) -> str:
        """Return string representation of User instance."""
        return (
            f"<User(id={self.id}, email='{self.email}', "
            f"name='{self.name}', is_active={self.is_active})>"
        )
    
    def __str__(self) -> str:
        """Return human-readable string representation."""
        return f"{self.name} ({self.email})"