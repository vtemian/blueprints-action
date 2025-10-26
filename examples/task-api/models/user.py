"""
User model definition for SQLAlchemy ORM.

This module contains the User model with secure password handling,
proper field validation, and database relationships.
"""

import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import (
    Column, String, Boolean, DateTime, Index, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from werkzeug.security import generate_password_hash, check_password_hash

# Base class for all models
Base = declarative_base()


class User(Base):
    """
    User model for application authentication and user management.
    
    This model handles user authentication, profile information, and
    maintains relationships with other entities in the system.
    
    Attributes:
        id (UUID): Primary key using UUID4
        email (str): User's email address (unique, indexed)
        password_hash (str): Bcrypt hashed password
        name (str): User's display name
        is_active (bool): Account activation status
        last_login (datetime): Timestamp of last successful login
        created_at (datetime): Account creation timestamp
        updated_at (datetime): Last modification timestamp
        tasks (relationship): Related Task objects
    """
    
    __tablename__ = 'users'
    
    # Primary key using UUID
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
        doc="Unique identifier for the user"
    )
    
    # User authentication and profile fields
    email = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        doc="User's email address (unique)"
    )
    
    password_hash = Column(
        String(255),
        nullable=False,
        doc="Bcrypt hashed password"
    )
    
    name = Column(
        String(100),
        nullable=False,
        doc="User's display name"
    )
    
    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
        doc="Account activation status"
    )
    
    # Timestamp fields
    last_login = Column(
        DateTime(timezone=True),
        nullable=True,
        doc="Timestamp of last successful login"
    )
    
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Account creation timestamp"
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        doc="Last modification timestamp"
    )
    
    # Relationships
    tasks = relationship(
        "Task",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="dynamic",
        doc="Tasks associated with this user"
    )
    
    # Database indexes
    __table_args__ = (
        Index('ix_users_email', 'email'),
        Index('ix_users_created_at', 'created_at'),
        Index('ix_users_is_active', 'is_active'),
    )
    
    def __init__(
        self,
        email: str,
        password: str,
        name: str,
        is_active: bool = True,
        **kwargs
    ) -> None:
        """
        Initialize a new User instance.
        
        Args:
            email (str): User's email address
            password (str): Plain text password (will be hashed)
            name (str): User's display name
            is_active (bool): Account activation status
            **kwargs: Additional keyword arguments
            
        Raises:
            ValueError: If required fields are empty or invalid
        """
        if not email or not email.strip():
            raise ValueError("Email cannot be empty")
        
        if not password or len(password.strip()) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
        if not name or not name.strip():
            raise ValueError("Name cannot be empty")
        
        self.email = email.strip().lower()
        self.name = name.strip()
        self.is_active = is_active
        self.set_password(password)
        
        # Set any additional fields
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
    
    def set_password(self, password: str) -> None:
        """
        Hash and store a new password for the user.
        
        Uses Werkzeug's secure password hashing with bcrypt.
        
        Args:
            password (str): Plain text password to hash
            
        Raises:
            ValueError: If password is empty or too short
            TypeError: If password is not a string
        """
        if not isinstance(password, str):
            raise TypeError("Password must be a string")
        
        if not password or len(password.strip()) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
        # Generate hash with bcrypt method and higher cost factor for security
        self.password_hash = generate_password_hash(
            password,
            method='pbkdf2:sha256:150000'  # 150,000 iterations for security
        )
    
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
            # Log the exception in production
            return False
    
    def update_last_login(self) -> None:
        """
        Update the last_login timestamp to current time.
        
        This method should be called after successful authentication.
        """
        self.last_login = datetime.utcnow()
    
    def to_dict(self, include_timestamps: bool = True) -> Dict[str, Any]:
        """
        Convert user instance to dictionary representation.
        
        Excludes sensitive information like password_hash.
        
        Args:
            include_timestamps (bool): Whether to include timestamp fields
            
        Returns:
            Dict[str, Any]: Dictionary representation of user
        """
        user_dict = {
            'id': str(self.id),
            'email': self.email,
            'name': self.name,
            'is_active': self.is_active,
        }
        
        if include_timestamps:
            user_dict.update({
                'last_login': self.last_login.isoformat() if self.last_login else None,
                'created_at': self.created_at.isoformat() if self.created_at else None,
                'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            })
        
        return user_dict
    
    def is_authenticated(self) -> bool:
        """
        Check if user is authenticated (active account).
        
        Returns:
            bool: True if user account is active
        """
        return self.is_active
    
    def get_id(self) -> str:
        """
        Get user ID as string (Flask-Login compatibility).
        
        Returns:
            str: String representation of user ID
        """
        return str(self.id)
    
    @classmethod
    def find_by_email(cls, session, email: str) -> Optional['User']:
        """
        Find user by email address.
        
        Args:
            session: SQLAlchemy session
            email (str): Email address to search for
            
        Returns:
            Optional[User]: User instance if found, None otherwise
        """
        if not email or not email.strip():
            return None
        
        return session.query(cls).filter(
            cls.email == email.strip().lower()
        ).first()
    
    @classmethod
    def find_active_users(cls, session, limit: int = 100) -> list['User']:
        """
        Find active users with optional limit.
        
        Args:
            session: SQLAlchemy session
            limit (int): Maximum number of users to return
            
        Returns:
            list[User]: List of active user instances
        """
        return session.query(cls).filter(
            cls.is_active == True
        ).limit(limit).all()
    
    def __repr__(self) -> str:
        """
        String representation of User instance.
        
        Returns:
            str: String representation
        """
        return f"<User(id='{self.id}', email='{self.email}', name='{self.name}')>"
    
    def __str__(self) -> str:
        """
        Human-readable string representation.
        
        Returns:
            str: User's name and email
        """
        return f"{self.name} ({self.email})"