"""
Task model definition for SQLAlchemy ORM.
Module: models.task
"""

from datetime import datetime
import uuid
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Index, Enum as SQLEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class TaskStatus(Enum):
    """Task status enumeration."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(Enum):
    """Task priority enumeration."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base):
    """
    Task model representing user tasks with status tracking and due dates.
    
    Attributes:
        id: Unique identifier for the task
        title: Task title (required)
        description: Detailed task description (optional)
        status: Current task status (pending, in_progress, completed)
        priority: Task priority level (low, medium, high)
        user_id: Foreign key reference to the owning user
        due_date: Optional deadline for task completion
        completed_at: Timestamp when task was marked complete
        created_at: Task creation timestamp
        updated_at: Last modification timestamp
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
        index=True
    )
    
    description = Column(
        Text,
        nullable=True
    )
    
    status = Column(
        SQLEnum(TaskStatus),
        nullable=False,
        default=TaskStatus.PENDING,
        index=True
    )
    
    priority = Column(
        SQLEnum(TaskPriority),
        nullable=False,
        default=TaskPriority.MEDIUM
    )
    
    # Foreign key relationship
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Timestamp fields
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
        back_populates="tasks"
    )
    
    # Database indexes
    __table_args__ = (
        Index("ix_tasks_user_status", "user_id", "status"),
        Index("ix_tasks_due_date_status", "due_date", "status"),
        Index("ix_tasks_priority_status", "priority", "status"),
    )
    
    def mark_complete(self) -> None:
        """
        Mark the task as completed and set completion timestamp.
        
        Sets the task status to COMPLETED and records the completion time.
        Only updates completed_at if the status actually changes to completed.
        """
        if self.status != TaskStatus.COMPLETED:
            self.status = TaskStatus.COMPLETED
            self.completed_at = datetime.utcnow().replace(microsecond=0)
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue based on due_date.
        
        Returns:
            bool: True if task has a due_date and it's in the past,
                  False if no due_date or due_date is in the future
        """
        if self.due_date is None:
            return False
        
        current_time = datetime.utcnow()
        # Handle timezone-aware comparison safely
        if self.due_date.tzinfo is not None:
            current_time = current_time.replace(tzinfo=self.due_date.tzinfo)
        
        return current_time > self.due_date
    
    @property
    def is_completed(self) -> bool:
        """Check if task is completed."""
        return self.status == TaskStatus.COMPLETED
    
    @property
    def days_until_due(self) -> Optional[int]:
        """
        Calculate days until due date.
        
        Returns:
            int: Number of days until due (negative if overdue)
            None: If no due date is set
        """
        if self.due_date is None:
            return None
        
        current_time = datetime.utcnow()
        if self.due_date.tzinfo is not None:
            current_time = current_time.replace(tzinfo=self.due_date.tzinfo)
        
        delta = self.due_date - current_time
        return delta.days
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"<Task(id={self.id}, title='{self.title}', "
            f"status={self.status.value}, priority={self.priority.value}, "
            f"user_id={self.user_id})>"
        )
    
    def __str__(self) -> str:
        """Human-readable string representation."""
        return f"{self.title} ({self.status.value})"