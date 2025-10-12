"""
Task model for the application.

This module defines the Task entity with all required fields, relationships,
and business logic methods.
"""

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column

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
    Task model representing a user task with status tracking and priority management.
    
    This model handles task lifecycle including creation, status updates,
    completion tracking, and due date management.
    """
    
    __tablename__ = "tasks"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid()
    )
    
    # Core task fields
    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        index=True
    )
    
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )
    
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus),
        nullable=False,
        default=TaskStatus.PENDING,
        index=True
    )
    
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority),
        nullable=False,
        default=TaskPriority.MEDIUM
    )
    
    # Foreign key relationship
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Date fields
    due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True
    )
    
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )
    
    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="tasks",
        lazy="select"
    )
    
    # Indexes
    __table_args__ = (
        Index("idx_tasks_user_status", "user_id", "status"),
        Index("idx_tasks_due_date_status", "due_date", "status"),
        Index("idx_tasks_priority_status", "priority", "status"),
    )
    
    def mark_complete(self) -> None:
        """
        Mark the task as completed and set the completion timestamp.
        
        This method updates the task status to 'completed' and sets the
        completed_at field to the current UTC datetime. If the task is
        already completed, this method is idempotent.
        
        Raises:
            ValueError: If the task is in an invalid state for completion.
        """
        if self.status == TaskStatus.COMPLETED:
            # Task is already completed, no action needed
            return
            
        self.status = TaskStatus.COMPLETED
        self.completed_at = datetime.utcnow()
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue based on the due date.
        
        A task is considered overdue if:
        1. It has a due_date set (not None)
        2. The current UTC datetime is past the due_date
        3. The task is not yet completed
        
        Returns:
            bool: True if the task is overdue, False otherwise.
                 Returns False if due_date is None or task is completed.
        """
        # If no due date is set, task cannot be overdue
        if self.due_date is None:
            return False
            
        # If task is completed, it's not considered overdue
        if self.status == TaskStatus.COMPLETED:
            return False
            
        # Check if current time is past due date
        current_time = datetime.utcnow()
        
        # Handle timezone-aware comparison
        if self.due_date.tzinfo is not None:
            # If due_date is timezone-aware, make current_time timezone-aware too
            from datetime import timezone
            current_time = current_time.replace(tzinfo=timezone.utc)
        
        return current_time > self.due_date
    
    def __repr__(self) -> str:
        """String representation of the Task instance."""
        return (
            f"<Task(id={self.id}, title='{self.title}', "
            f"status={self.status.value}, priority={self.priority.value})>"
        )
    
    def __str__(self) -> str:
        """Human-readable string representation of the Task."""
        return f"Task: {self.title} ({self.status.value})"