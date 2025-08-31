"""
Task model definition for task management system.

This module defines the Task SQLAlchemy model with comprehensive field definitions,
relationships, and business logic methods.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Index, 
    func, Boolean
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.exc import SQLAlchemyError

from core.database import Base, db


class TaskStatus(Enum):
    """Enumeration for task status values."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(Enum):
    """Enumeration for task priority values."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base):
    """
    Task model representing a user task with status tracking and priority management.
    
    This model handles task lifecycle management including creation, status updates,
    completion tracking, and due date monitoring.
    """
    
    __tablename__ = "tasks"
    
    # Table indexes for optimized queries
    __table_args__ = (
        Index('idx_task_user_id', 'user_id'),
        Index('idx_task_status', 'status'),
        Index('idx_task_due_date', 'due_date'),
        Index('idx_task_user_status', 'user_id', 'status'),
    )
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False
    )
    
    # Core task fields
    title = Column(
        String(200),
        nullable=False,
        index=True
    )
    
    description = Column(
        Text,
        nullable=True
    )
    
    status = Column(
        String(20),
        nullable=False,
        default=TaskStatus.PENDING.value,
        index=True
    )
    
    priority = Column(
        String(10),
        nullable=False,
        default=TaskPriority.MEDIUM.value
    )
    
    # Foreign key relationship
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )
    
    # Date/time fields
    due_date = Column(
        DateTime(timezone=True),
        nullable=True,
        index=True
    )
    
    completed_at = Column(
        DateTime(timezone=True),
        nullable=True
    )
    
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )
    
    # Relationships
    user = relationship(
        "User",
        back_populates="tasks",
        lazy="select"
    )
    
    def __repr__(self) -> str:
        """String representation of Task instance for debugging."""
        return (
            f"<Task(id={self.id}, title='{self.title[:30]}...', "
            f"status={self.status}, priority={self.priority}, "
            f"user_id={self.user_id})>"
        )
    
    def mark_complete(self) -> bool:
        """
        Mark the task as completed and set completion timestamp.
        
        Returns:
            bool: True if successfully marked complete, False otherwise.
            
        Raises:
            SQLAlchemyError: If database operation fails.
        """
        try:
            if self.status == TaskStatus.COMPLETED.value:
                return True  # Already completed
                
            self.status = TaskStatus.COMPLETED.value
            self.completed_at = datetime.now(timezone.utc)
            
            # Commit the changes
            db.session.add(self)
            db.session.commit()
            
            return True
            
        except SQLAlchemyError as e:
            db.session.rollback()
            raise SQLAlchemyError(f"Failed to mark task as complete: {str(e)}")
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue based on due_date.
        
        Returns:
            bool: True if task has a due_date and it's in the past, False otherwise.
        """
        if self.due_date is None:
            return False
            
        if self.status == TaskStatus.COMPLETED.value:
            return False
            
        current_time = datetime.now(timezone.utc)
        
        # Handle timezone-naive due_date by assuming UTC
        due_date = self.due_date
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
            
        return due_date < current_time
    
    def update_status(self, new_status: TaskStatus) -> bool:
        """
        Update task status with validation.
        
        Args:
            new_status (TaskStatus): The new status to set.
            
        Returns:
            bool: True if successfully updated, False otherwise.
            
        Raises:
            ValueError: If invalid status provided.
            SQLAlchemyError: If database operation fails.
        """
        try:
            if not isinstance(new_status, TaskStatus):
                raise ValueError(f"Invalid status type: {type(new_status)}")
            
            old_status = self.status
            self.status = new_status.value
            
            # Set completed_at if marking as completed
            if new_status == TaskStatus.COMPLETED and old_status != TaskStatus.COMPLETED.value:
                self.completed_at = datetime.now(timezone.utc)
            elif new_status != TaskStatus.COMPLETED:
                self.completed_at = None
            
            db.session.add(self)
            db.session.commit()
            
            return True
            
        except (ValueError, SQLAlchemyError) as e:
            db.session.rollback()
            raise e
    
    def set_priority(self, new_priority: TaskPriority) -> bool:
        """
        Update task priority with validation.
        
        Args:
            new_priority (TaskPriority): The new priority to set.
            
        Returns:
            bool: True if successfully updated, False otherwise.
            
        Raises:
            ValueError: If invalid priority provided.
            SQLAlchemyError: If database operation fails.
        """
        try:
            if not isinstance(new_priority, TaskPriority):
                raise ValueError(f"Invalid priority type: {type(new_priority)}")
            
            self.priority = new_priority.value
            
            db.session.add(self)
            db.session.commit()
            
            return True
            
        except (ValueError, SQLAlchemyError) as e:
            db.session.rollback()
            raise e
    
    @property
    def status_enum(self) -> TaskStatus:
        """Get status as enum value."""
        return TaskStatus(self.status)
    
    @property
    def priority_enum(self) -> TaskPriority:
        """Get priority as enum value."""
        return TaskPriority(self.priority)
    
    @property
    def is_completed(self) -> bool:
        """Check if task is completed."""
        return self.status == TaskStatus.COMPLETED.value
    
    @property
    def days_until_due(self) -> Optional[int]:
        """
        Calculate days until due date.
        
        Returns:
            Optional[int]: Number of days until due (negative if overdue), 
                          None if no due date set.
        """
        if self.due_date is None:
            return None
            
        current_time = datetime.now(timezone.utc)
        due_date = self.due_date
        
        # Handle timezone-naive due_date
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
            
        delta = due_date - current_time
        return delta.days
    
    def to_dict(self) -> dict:
        """
        Convert task instance to dictionary representation.
        
        Returns:
            dict: Dictionary containing task data.
        """
        return {
            'id': str(self.id),
            'title': self.title,
            'description': self.description,
            'status': self.status,
            'priority': self.priority,
            'user_id': str(self.user_id),
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_overdue': self.is_overdue(),
            'is_completed': self.is_completed,
            'days_until_due': self.days_until_due
        }