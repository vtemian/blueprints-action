from datetime import datetime
from typing import Optional, Dict, Any
from uuid import uuid4, UUID as UUIDType
import bcrypt

from sqlalchemy import Column, String, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from core.database import Base


class User(Base):
    """
    User model for authentication and user management.
    
    Represents a user in the system with authentication capabilities,
    profile information, and activity tracking.
    """
    
    __tablename__ = "users"
    __table_args__ = (
        Index('ix_users_email', 'email', unique=True),
    )
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, onupdate=func.now(), nullable=True)
    
    def set_password(self, password: str) -> None:
        """
        Hash and set the user's password using bcrypt.
        
        Args:
            password: Plain text password to hash and store
            
        Raises:
            ValueError: If password is empty or None
            Exception: If bcrypt hashing fails
        """
        try:
            if not password:
                raise ValueError("Password cannot be empty")
            
            # Generate salt and hash password
            salt = bcrypt.gensalt()
            password_bytes = password.encode('utf-8')
            hashed = bcrypt.hashpw(password_bytes, salt)
            
            # Store as string
            self.password_hash = hashed.decode('utf-8')
            
        except Exception as e:
            raise Exception(f"Failed to hash password: {str(e)}")
    
    def check_password(self, password: str) -> bool:
        """
        Verify a password against the stored hash.
        
        Args:
            password: Plain text password to verify
            
        Returns:
            bool: True if password matches, False otherwise
        """
        try:
            if not password or not self.password_hash:
                return False
            
            password_bytes = password.encode('utf-8')
            hash_bytes = self.password_hash.encode('utf-8')
            
            return bcrypt.checkpw(password_bytes, hash_bytes)
            
        except Exception:
            return False
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert user instance to dictionary representation.
        
        Excludes sensitive information like password_hash and handles
        datetime serialization for JSON compatibility.
        
        Returns:
            dict: Dictionary representation of user data
        """
        try:
            return {
                'id': str(self.id),
                'email': self.email,
                'name': self.name,
                'is_active': self.is_active,
                'last_login': self.last_login.isoformat() if self.last_login else None,
                'created_at': self.created_at.isoformat() if self.created_at else None,
                'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            }
        except Exception as e:
            # Fallback to basic representation
            return {
                'id': str(self.id) if self.id else None,
                'email': self.email,
                'name': self.name,
                'is_active': self.is_active,
                'last_login': None,
                'created_at': None,
                'updated_at': None,
            }
    
    def __repr__(self) -> str:
        """String representation of User instance."""
        return f"<User(id={self.id}, email='{self.email}', name='{self.name}')>"