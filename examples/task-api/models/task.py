"""
Task model for managing user tasks with status tracking and priority levels.

This module defines the Task SQLAlchemy model with comprehensive field validation,
automatic timestamp management, and utility methods for task lifecycle management.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Enum as SQLEnum, 
    Index, Boolean, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class TaskStatus(Enum):
    """Enumeration for task status values."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(Enum):
    """Enumeration for task priority levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base):
    """
    Task model for managing user tasks with status tracking and priority levels.
    
    This model provides comprehensive task management functionality including
    status tracking, priority levels, due dates, and automatic timestamp management.
    
    Attributes:
        id (UUID): Primary key using UUID4
        title (str): Task title, required, max 200 characters
        description (str, optional): Detailed task description
        status (TaskStatus): Current task status (pending, in_progress, completed)
        priority (TaskPriority): Task priority level (low, medium, high)
        due_date (datetime, optional): When the task is due
        completed_at (datetime, optional): When the task was completed
        created_at (datetime): When the task was created (auto-generated)
        updated_at (datetime): When the task was last updated (auto-updated)
        user_id (UUID): Foreign key reference to the User model
        user: Relationship to the User model
    """
    
    __tablename__ = "tasks"
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
        doc="Unique identifier for the task"
    )
    
    # Core task fields
    title = Column(
        String(200),
        nullable=False,
        doc="Task title, required field with 200 character limit"
    )
    
    description = Column(
        Text,
        nullable=True,
        doc="Optional detailed description of the task"
    )
    
    # Status and priority enums
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
    
    # Date fields
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
    
    # Automatic timestamp fields
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
    
    # Foreign key relationship
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        doc="Reference to the user who owns this task"
    )
    
    # Relationships
    user = relationship(
        "User",
        back_populates="tasks",
        doc="Relationship to the User model"
    )
    
    # Database indexes for performance optimization
    __table_args__ = (
        Index("idx_tasks_user_id", "user_id"),
        Index("idx_tasks_status", "status"),
        Index("idx_tasks_due_date", "due_date"),
        Index("idx_tasks_priority", "priority"),
        Index("idx_tasks_created_at", "created_at"),
        Index("idx_tasks_user_status", "user_id", "status"),  # Composite index
    )
    
    def mark_complete(self) -> None:
        """
        Mark the task as completed and set the completion timestamp.
        
        Updates the task status to 'completed' and sets the completed_at
        field to the current UTC timestamp.
        """
        self.status = TaskStatus.COMPLETED
        self.completed_at = datetime.utcnow()
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue.
        
        Returns:
            bool: True if the task has a due_date and it's in the past,
                  False if no due_date is set or the due_date is in the future.
        """
        if self.due_date is None:
            return False
        
        # Handle timezone-aware comparison
        current_time = datetime.utcnow()
        if self.due_date.tzinfo is not None:
            # If due_date is timezone-aware, make current_time timezone-aware too
            from datetime import timezone
            current_time = current_time.replace(tzinfo=timezone.utc)
        
        return self.due_date < current_time
    
    def is_completed(self) -> bool:
        """
        Check if the task is completed.
        
        Returns:
            bool: True if the task status is completed, False otherwise.
        """
        return self.status == TaskStatus.COMPLETED
    
    def days_until_due(self) -> Optional[int]:
        """
        Calculate the number of days until the task is due.
        
        Returns:
            Optional[int]: Number of days until due date, None if no due date is set.
                          Negative values indicate overdue tasks.
        """
        if self.due_date is None:
            return None
        
        current_time = datetime.utcnow()
        if self.due_date.tzinfo is not None:
            from datetime import timezone
            current_time = current_time.replace(tzinfo=timezone.utc)
        
        time_diff = self.due_date - current_time
        return time_diff.days
    
    def __repr__(self) -> str:
        """
        String representation of the Task instance for debugging.
        
        Returns:
            str: Human-readable representation of the task.
        """
        return (
            f"<Task(id='{self.id}', title='{self.title}', "
            f"status='{self.status.value}', priority='{self.priority.value}', "
            f"user_id='{self.user_id}')>"
        )
    
    def __str__(self) -> str:
        """
        User-friendly string representation of the Task.
        
        Returns:
            str: User-friendly representation showing title and status.
        """
        return f"{self.title} ({self.status.value})"