"""
Task model for the application.

This module defines the Task SQLAlchemy model with all necessary fields,
relationships, and business logic methods.
"""

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Index, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.exc import SQLAlchemyError

from core.database import Base


class TaskStatus(enum.Enum):
    """Enumeration for task status values."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(enum.Enum):
    """Enumeration for task priority values."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base):
    """
    Task model representing a user task in the system.
    
    This model stores task information including title, description, status,
    priority, and timing information. Each task belongs to a specific user
    and can have an optional due date.
    
    Attributes:
        id (UUID): Unique identifier for the task
        title (str): Task title (max 200 characters)
        description (str, optional): Detailed task description
        status (TaskStatus): Current status of the task
        priority (TaskPriority): Priority level of the task
        user_id (UUID): Foreign key reference to the owning user
        due_date (datetime, optional): When the task is due
        completed_at (datetime, optional): When the task was completed
        created_at (datetime): When the task was created
        updated_at (datetime): When the task was last updated
        
    Relationships:
        user: Many-to-one relationship with User model
    """
    
    __tablename__ = "tasks"
    
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
        doc="Task title with maximum 200 characters"
    )
    
    description = Column(
        Text,
        nullable=True,
        doc="Optional detailed description of the task"
    )
    
    status = Column(
        SQLEnum(TaskStatus),
        nullable=False,
        default=TaskStatus.PENDING,
        doc="Current status of the task"
    )
    
    priority = Column(
        SQLEnum(TaskPriority),
        nullable=False,
        default=TaskPriority.MEDIUM,
        doc="Priority level of the task"
    )
    
    # Foreign key relationship
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        doc="ID of the user who owns this task"
    )
    
    # Timing fields
    due_date = Column(
        DateTime(timezone=True),
        nullable=True,
        doc="Optional due date for the task"
    )
    
    completed_at = Column(
        DateTime(timezone=True),
        nullable=True,
        doc="Timestamp when the task was completed"
    )
    
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        doc="Timestamp when the task was created"
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        doc="Timestamp when the task was last updated"
    )
    
    # Relationships
    user = relationship(
        "User",
        back_populates="tasks",
        doc="The user who owns this task"
    )
    
    # Database indexes
    __table_args__ = (
        Index("idx_tasks_user_id", "user_id"),
        Index("idx_tasks_status", "status"),
        Index("idx_tasks_due_date", "due_date"),
        Index("idx_tasks_user_status", "user_id", "status"),  # Composite index for common queries
    )
    
    def __repr__(self) -> str:
        """String representation of the Task instance."""
        return (
            f"<Task(id={self.id}, title='{self.title}', "
            f"status={self.status.value}, priority={self.priority.value})>"
        )
    
    def __str__(self) -> str:
        """Human-readable string representation of the Task."""
        return f"Task: {self.title} ({self.status.value})"
    
    def mark_complete(self) -> bool:
        """
        Mark the task as completed.
        
        Sets the task status to 'completed' and records the completion timestamp.
        Only allows completion if the task is not already completed.
        
        Returns:
            bool: True if the task was successfully marked as complete,
                  False if it was already completed.
                  
        Raises:
            SQLAlchemyError: If there's a database error during the update.
        """
        try:
            if self.status == TaskStatus.COMPLETED:
                return False
            
            self.status = TaskStatus.COMPLETED
            self.completed_at = datetime.utcnow()
            return True
            
        except SQLAlchemyError as e:
            # Re-raise SQLAlchemy errors for proper handling by the caller
            raise e
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue.
        
        A task is considered overdue if:
        1. It has a due_date set
        2. The due_date is in the past
        3. The task is not completed
        
        Returns:
            bool: True if the task is overdue, False otherwise.
                  Returns False if due_date is None or task is completed.
        """
        # Return False if no due date is set
        if self.due_date is None:
            return False
        
        # Return False if task is already completed
        if self.status == TaskStatus.COMPLETED:
            return False
        
        # Check if due date is in the past
        current_time = datetime.utcnow()
        return self.due_date < current_time
    
    @property
    def is_completed(self) -> bool:
        """
        Check if the task is completed.
        
        Returns:
            bool: True if the task status is completed, False otherwise.
        """
        return self.status == TaskStatus.COMPLETED
    
    @property
    def days_until_due(self) -> Optional[int]:
        """
        Calculate the number of days until the task is due.
        
        Returns:
            int: Number of days until due (negative if overdue),
                 None if no due date is set.
        """
        if self.due_date is None:
            return None
        
        current_time = datetime.utcnow()
        time_diff = self.due_date - current_time
        return time_diff.days
    
    def to_dict(self) -> dict:
        """
        Convert the task instance to a dictionary representation.
        
        Returns:
            dict: Dictionary containing all task fields with serializable values.
        """
        return {
            "id": str(self.id),
            "title": self.title,
            "description": self.description,
            "status": self.status.value,
            "priority": self.priority.value,
            "user_id": str(self.user_id),
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "is_overdue": self.is_overdue(),
            "days_until_due": self.days_until_due
        }