"""
Task model module for SQLAlchemy ORM.

This module defines the Task model with proper relationships, constraints,
and business logic methods for task management functionality.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Index, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.exc import SQLAlchemyError
from enum import Enum

from core.database import Base

if TYPE_CHECKING:
    from models.user import User


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
    Task model representing a user task with status tracking and due dates.
    
    This model handles task lifecycle management including creation, status updates,
    and completion tracking with proper timestamp management.
    """
    
    __tablename__ = "tasks"
    
    # Primary key
    id: UUID = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
        doc="Unique identifier for the task"
    )
    
    # Core task fields
    title: str = Column(
        String(200),
        nullable=False,
        doc="Task title (max 200 characters)"
    )
    
    description: Optional[str] = Column(
        Text,
        nullable=True,
        doc="Detailed task description"
    )
    
    status: TaskStatus = Column(
        SQLEnum(TaskStatus, name="task_status_enum"),
        nullable=False,
        default=TaskStatus.PENDING,
        doc="Current task status"
    )
    
    priority: TaskPriority = Column(
        SQLEnum(TaskPriority, name="task_priority_enum"),
        nullable=False,
        default=TaskPriority.MEDIUM,
        doc="Task priority level"
    )
    
    # Foreign key relationship
    user_id: UUID = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        doc="ID of the user who owns this task"
    )
    
    # Timestamp fields
    due_date: Optional[datetime] = Column(
        DateTime(timezone=True),
        nullable=True,
        doc="Task due date with timezone"
    )
    
    completed_at: Optional[datetime] = Column(
        DateTime(timezone=True),
        nullable=True,
        doc="Timestamp when task was completed"
    )
    
    created_at: datetime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        doc="Task creation timestamp"
    )
    
    updated_at: datetime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        doc="Last update timestamp"
    )
    
    # Relationships
    user: "User" = relationship(
        "User",
        back_populates="tasks",
        doc="User who owns this task"
    )
    
    # Database indexes for performance
    __table_args__ = (
        Index("idx_task_user_id", "user_id"),
        Index("idx_task_status", "status"),
        Index("idx_task_due_date", "due_date"),
        Index("idx_task_user_status", "user_id", "status"),  # Composite index for common queries
    )
    
    def __repr__(self) -> str:
        """String representation of the Task instance."""
        return (
            f"<Task(id={self.id}, title='{self.title[:30]}...', "
            f"status={self.status.value}, priority={self.priority.value})>"
        )
    
    def mark_complete(self) -> bool:
        """
        Mark the task as completed and set completion timestamp.
        
        Returns:
            bool: True if task was successfully marked complete, False if already completed
            
        Raises:
            SQLAlchemyError: If database operation fails
        """
        try:
            # Check if task is already completed
            if self.status == TaskStatus.COMPLETED:
                return False
            
            # Update status and completion timestamp
            self.status = TaskStatus.COMPLETED
            self.completed_at = datetime.now(timezone.utc)
            
            return True
            
        except SQLAlchemyError as e:
            # Re-raise SQLAlchemy errors for proper handling at service layer
            raise SQLAlchemyError(f"Failed to mark task as complete: {str(e)}") from e
        except Exception as e:
            # Handle any other unexpected errors
            raise RuntimeError(f"Unexpected error marking task complete: {str(e)}") from e
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue based on due_date.
        
        Returns:
            bool: True if task has a due_date and it's in the past, False otherwise
        """
        try:
            # Return False if no due date is set
            if self.due_date is None:
                return False
            
            # Return False if task is already completed
            if self.status == TaskStatus.COMPLETED:
                return False
            
            # Get current UTC time for comparison
            current_time = datetime.now(timezone.utc)
            
            # Ensure due_date is timezone-aware for proper comparison
            if self.due_date.tzinfo is None:
                # If due_date is naive, assume it's UTC
                due_date_aware = self.due_date.replace(tzinfo=timezone.utc)
            else:
                due_date_aware = self.due_date
            
            return due_date_aware < current_time
            
        except Exception as e:
            # Log error and return False as safe default
            # In production, you might want to use proper logging here
            print(f"Error checking if task is overdue: {str(e)}")
            return False
    
    def update_status(self, new_status: TaskStatus) -> bool:
        """
        Update task status with proper validation.
        
        Args:
            new_status: The new status to set
            
        Returns:
            bool: True if status was updated, False if no change needed
            
        Raises:
            ValueError: If new_status is not a valid TaskStatus
            SQLAlchemyError: If database operation fails
        """
        try:
            # Validate input
            if not isinstance(new_status, TaskStatus):
                raise ValueError(f"Invalid status type: {type(new_status)}")
            
            # Check if status is actually changing
            if self.status == new_status:
                return False
            
            # Handle completion logic
            if new_status == TaskStatus.COMPLETED:
                return self.mark_complete()
            
            # Handle uncompleting a task
            if self.status == TaskStatus.COMPLETED and new_status != TaskStatus.COMPLETED:
                self.completed_at = None
            
            # Update status
            self.status = new_status
            return True
            
        except ValueError:
            # Re-raise validation errors
            raise
        except SQLAlchemyError as e:
            raise SQLAlchemyError(f"Failed to update task status: {str(e)}") from e
        except Exception as e:
            raise RuntimeError(f"Unexpected error updating task status: {str(e)}") from e
    
    def set_due_date(self, due_date: Optional[datetime]) -> None:
        """
        Set task due date with timezone handling.
        
        Args:
            due_date: The due date to set (should be timezone-aware) or None to clear
            
        Raises:
            ValueError: If due_date is in the past
        """
        try:
            if due_date is not None:
                # Ensure timezone awareness
                if due_date.tzinfo is None:
                    due_date = due_date.replace(tzinfo=timezone.utc)
                
                # Validate due date is not in the past (with 1 minute tolerance)
                current_time = datetime.now(timezone.utc)
                if due_date < current_time:
                    raise ValueError("Due date cannot be in the past")
            
            self.due_date = due_date
            
        except ValueError:
            # Re-raise validation errors
            raise
        except Exception as e:
            raise RuntimeError(f"Unexpected error setting due date: {str(e)}") from e
    
    @property
    def is_completed(self) -> bool:
        """Check if task is completed."""
        return self.status == TaskStatus.COMPLETED
    
    @property
    def days_until_due(self) -> Optional[int]:
        """
        Calculate days until due date.
        
        Returns:
            int: Number of days until due (negative if overdue), None if no due date
        """
        if self.due_date is None:
            return None
        
        try:
            current_time = datetime.now(timezone.utc)
            
            # Ensure due_date is timezone-aware
            if self.due_date.tzinfo is None:
                due_date_aware = self.due_date.replace(tzinfo=timezone.utc)
            else:
                due_date_aware = self.due_date
            
            delta = due_date_aware - current_time
            return delta.days
            
        except Exception:
            return None