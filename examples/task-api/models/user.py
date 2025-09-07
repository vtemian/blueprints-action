"""
User model module for SQLAlchemy ORM with authentication methods.

This module provides a complete User model with secure password handling,
relationships, and utility methods for user management.
"""

from datetime import datetime, timezone
from typing import Dict, Any, Optional
import uuid

from sqlalchemy import Column, String, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash

from core.database import Base


class User(Base):
    """
    User model with authentication and profile management capabilities.
    
    This model handles user authentication, profile data, and relationships
    with other entities in the system. Passwords are securely hashed using
    PBKDF2 with SHA-256.
    
    Attributes:
        id: Unique identifier (UUID)
        email: User's email address (unique, indexed)
        password_hash: Securely hashed password
        name: User's display name
        is_active: Account status flag
        last_login: Timestamp of last successful login
        created_at: Account creation timestamp
        updated_at: Last modification timestamp
        tasks: Related Task objects (one-to-many relationship)
    """
    
    __tablename__ = 'users'
    
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
    
    # Account status and metadata
    is_active = Column(
        Boolean,
        default=True,
        nullable=False
    )
    
    last_login = Column(
        DateTime(timezone=True),
        nullable=True
    )
    
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
    
    # Database indexes for performance
    __table_args__ = (
        Index('ix_users_email_active', 'email', 'is_active'),
        Index('ix_users_created_at', 'created_at'),
    )
    
    def __repr__(self) -> str:
        """
        String representation of the User object.
        
        Returns:
            String representation showing ID, email, and active status
        """
        return f"<User(id='{self.id}', email='{self.email}', active={self.is_active})>"
    
    def set_password(self, password: Optional[str]) -> None:
        """
        Hash and store a password securely.
        
        Uses PBKDF2 with SHA-256 for secure password hashing. The method
        handles validation and stores the resulting hash in password_hash.
        
        Args:
            password: Plain text password to hash and store
            
        Raises:
            ValueError: If password is None or empty string
            
        Example:
            user = User(email="test@example.com", name="Test User")
            user.set_password("secure_password123")
        """
        if not password:
            raise ValueError("Password cannot be None or empty")
        
        if not isinstance(password, str):
            raise ValueError("Password must be a string")
        
        if len(password.strip()) == 0:
            raise ValueError("Password cannot be empty or whitespace only")
        
        self.password_hash = generate_password_hash(
            password,
            method='pbkdf2:sha256',
            salt_length=16
        )
    
    def check_password(self, password: Optional[str]) -> bool:
        """
        Verify a password against the stored hash.
        
        Compares the provided password with the stored password hash
        using secure comparison methods.
        
        Args:
            password: Plain text password to verify
            
        Returns:
            True if password matches, False otherwise
            
        Example:
            if user.check_password("user_input_password"):
                # Password is correct
                pass
        """
        if not password:
            return False
        
        if not isinstance(password, str):
            return False
        
        if not hasattr(self, 'password_hash') or not self.password_hash:
            return False
        
        try:
            return check_password_hash(self.password_hash, password)
        except Exception:
            # Handle any unexpected errors in password checking
            return False
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert User object to dictionary representation.
        
        Creates a dictionary containing all user attributes except
        the password hash for security reasons. Handles UUID and
        datetime serialization.
        
        Returns:
            Dictionary representation of the user object
            
        Example:
            user_data = user.to_dict()
            # Returns: {
            #     'id': 'uuid-string',
            #     'email': 'user@example.com',
            #     'name': 'User Name',
            #     'is_active': True,
            #     'last_login': '2023-01-01T12:00:00+00:00',
            #     'created_at': '2023-01-01T10:00:00+00:00',
            #     'updated_at': '2023-01-01T11:00:00+00:00'
            # }
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
        Update the last_login timestamp to current UTC time.
        
        This method should be called when a user successfully
        authenticates to track login activity.
        
        Example:
            user.update_last_login()
            db.session.commit()
        """
        self.last_login = datetime.now(timezone.utc)
    
    def deactivate(self) -> None:
        """
        Deactivate the user account.
        
        Sets is_active to False, effectively disabling the account
        without deleting the user data.
        
        Example:
            user.deactivate()
            db.session.commit()
        """
        self.is_active = False
    
    def activate(self) -> None:
        """
        Activate the user account.
        
        Sets is_active to True, enabling the account for login
        and normal operations.
        
        Example:
            user.activate()
            db.session.commit()
        """
        self.is_active = True
    
    @classmethod
    def find_by_email(cls, email: str) -> Optional['User']:
        """
        Find a user by email address.
        
        Args:
            email: Email address to search for
            
        Returns:
            User object if found, None otherwise
            
        Note:
            This method requires an active SQLAlchemy session context.
            
        Example:
            user = User.find_by_email("test@example.com")
            if user:
                print(f"Found user: {user.name}")
        """
        from sqlalchemy.orm import sessionmaker
        from core.database import engine
        
        Session = sessionmaker(bind=engine)
        session = Session()
        
        try:
            return session.query(cls).filter(
                cls.email == email.lower().strip()
            ).first()
        finally:
            session.close()
    
    def __eq__(self, other: object) -> bool:
        """
        Compare two User objects for equality.
        
        Args:
            other: Object to compare with
            
        Returns:
            True if objects represent the same user, False otherwise
        """
        if not isinstance(other, User):
            return False
        return self.id == other.id
    
    def __hash__(self) -> int:
        """
        Generate hash for User object.
        
        Returns:
            Hash value based on user ID
        """
        return hash(self.id)


# Export the model for easy importing
__all__ = ['User']