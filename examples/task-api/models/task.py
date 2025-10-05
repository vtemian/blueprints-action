"""
Task model for the application.

This module defines the Task model with all necessary fields, relationships,
and business logic methods for task management functionality.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UUID,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

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
    Task model representing a user task with status tracking and priority management.
    
    This model handles task lifecycle management including creation, status updates,
    completion tracking, and due date monitoring.
    
    Attributes:
        id: Unique identifier for the task
        title: Task title (required, max 200 characters)
        description: Detailed task description (optional)
        status: Current task status (pending, in_progress, completed)
        priority: Task priority level (low, medium, high)
        user_id: Foreign key reference to the task owner
        due_date: Optional deadline for task completion
        completed_at: Timestamp when task was marked complete
        created_at: Timestamp when task was created
        updated_at: Timestamp when task was last modified
    """
    
    __tablename__ = "tasks"
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
        doc="Unique identifier for the task"
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
        doc="Detailed description of the task"
    )
    
    status = Column(
        SQLEnum(TaskStatus),
        nullable=False,
        default=TaskStatus.PENDING,
        index=True,
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
        index=True,
        doc="Foreign key reference to the task owner"
    )
    
    # Date and time fields
    due_date = Column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
        doc="Optional deadline for task completion"
    )
    
    completed_at = Column(
        DateTime(timezone=True),
        nullable=True,
        doc="Timestamp when task was marked as completed"
    )
    
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        doc="Timestamp when task was created"
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        doc="Timestamp when task was last updated"
    )
    
    # Relationships
    user = relationship(
        "User",
        back_populates="tasks",
        doc="Relationship to the User who owns this task"
    )
    
    # Database indexes
    __table_args__ = (
        Index("idx_task_user_status", "user_id", "status"),
        Index("idx_task_due_date_status", "due_date", "status"),
        Index("idx_task_priority_status", "priority", "status"),
    )
    
    def __repr__(self) -> str:
        """
        String representation of the Task instance for debugging.
        
        Returns:
            String representation showing key task attributes
        """
        return (
            f"<Task(id={self.id}, title='{self.title[:30]}...', "
            f"status={self.status.value}, priority={self.priority.value})>"
        )
    
    def mark_complete(self) -> None:
        """
        Mark the task as completed and record the completion timestamp.
        
        This method updates the task status to completed and sets the
        completed_at timestamp to the current time. If the task is already
        completed, this method is idempotent and won't change the original
        completion time.
        
        Raises:
            ValueError: If the task is in an invalid state for completion
        """
        if self.status == TaskStatus.COMPLETED:
            # Task already completed, no action needed
            return
            
        self.status = TaskStatus.COMPLETED
        if self.completed_at is None:
            self.completed_at = datetime.utcnow()
    
    def is_overdue(self) -> bool:
        """
        Check if the task is past its due date.
        
        A task is considered overdue if:
        1. It has a due_date set
        2. The current time is past the due_date
        3. The task is not yet completed
        
        Returns:
            bool: True if the task is overdue, False otherwise
            
        Note:
            Tasks without a due_date are never considered overdue.
            Completed tasks are never considered overdue regardless of due_date.
        """
        if self.due_date is None:
            return False
            
        if self.status == TaskStatus.COMPLETED:
            return False
            
        return datetime.utcnow() > self.due_date
    
    def days_until_due(self) -> Optional[int]:
        """
        Calculate the number of days until the task is due.
        
        Returns:
            Optional[int]: Number of days until due date, None if no due date set.
                          Negative values indicate overdue tasks.
        """
        if self.due_date is None:
            return None
            
        delta = self.due_date.date() - datetime.utcnow().date()
        return delta.days
    
    def can_be_completed(self) -> bool:
        """
        Check if the task can be marked as completed.
        
        Returns:
            bool: True if the task can be completed, False otherwise
        """
        return self.status in [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]
    
    def set_priority(self, priority: TaskPriority) -> None:
        """
        Set the task priority with validation.
        
        Args:
            priority: The new priority level for the task
            
        Raises:
            ValueError: If priority is not a valid TaskPriority enum value
        """
        if not isinstance(priority, TaskPriority):
            raise ValueError(f"Priority must be a TaskPriority enum, got {type(priority)}")
        
        self.priority = priority
    
    def set_status(self, status: TaskStatus) -> None:
        """
        Set the task status with validation and side effects.
        
        Args:
            status: The new status for the task
            
        Raises:
            ValueError: If status is not a valid TaskStatus enum value
        """
        if not isinstance(status, TaskStatus):
            raise ValueError(f"Status must be a TaskStatus enum, got {type(status)}")
        
        # Handle completion logic
        if status == TaskStatus.COMPLETED and self.status != TaskStatus.COMPLETED:
            self.completed_at = datetime.utcnow()
        elif status != TaskStatus.COMPLETED:
            self.completed_at = None
            
        self.status = status