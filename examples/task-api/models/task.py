"""
Task model definition for SQLAlchemy ORM.

This module defines the Task model with proper UUID handling, enum types,
relationships, and business logic methods.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Index,
    Enum as SQLEnum, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


# Define Python enums for type safety and validation
class TaskStatus(PyEnum):
    """Task status enumeration."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(PyEnum):
    """Task priority enumeration."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base):
    """
    Task model representing user tasks with status tracking and due dates.
    
    This model handles task lifecycle management including creation, updates,
    completion tracking, and overdue detection with timezone-aware comparisons.
    """
    
    __tablename__ = "tasks"
    
    # Primary key with UUID4 generation
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
        comment="Unique task identifier"
    )
    
    # Core task fields
    title = Column(
        String(200),
        nullable=False,
        comment="Task title (max 200 characters)"
    )
    
    description = Column(
        Text,
        nullable=True,
        comment="Detailed task description"
    )
    
    # Status and priority using SQLAlchemy Enum with Python enum backing
    status = Column(
        SQLEnum(TaskStatus, name="task_status_enum"),
        nullable=False,
        default=TaskStatus.PENDING,
        comment="Current task status"
    )
    
    priority = Column(
        SQLEnum(TaskPriority, name="task_priority_enum"),
        nullable=False,
        default=TaskPriority.MEDIUM,
        comment="Task priority level"
    )
    
    # Foreign key relationship to User table
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="ID of the user who owns this task"
    )
    
    # Date/time fields with proper timezone handling
    due_date = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Task due date (timezone-aware)"
    )
    
    completed_at = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when task was completed"
    )
    
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="Task creation timestamp"
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        comment="Last modification timestamp"
    )
    
    # Relationships
    user = relationship(
        "User",
        back_populates="tasks",
        lazy="select"
    )
    
    # Database indexes for query optimization
    __table_args__ = (
        Index("idx_tasks_user_id", "user_id"),
        Index("idx_tasks_status", "status"),
        Index("idx_tasks_due_date", "due_date"),
        Index("idx_tasks_user_status", "user_id", "status"),  # Composite index for common queries
    )
    
    def mark_complete(self) -> None:
        """
        Mark the task as completed and set the completion timestamp.
        
        This method updates both the status and completed_at fields
        with timezone-aware datetime.
        """
        self.status = TaskStatus.COMPLETED
        self.completed_at = datetime.now(timezone.utc)
    
    def is_overdue(self) -> bool:
        """
        Check if the task is past its due date.
        
        Returns:
            bool: True if task has a due_date and it's in the past,
                  False if no due_date is set or due_date is in the future.
                  
        Note:
            Uses timezone-aware comparison. Tasks without due_date
            are never considered overdue.
        """
        if self.due_date is None:
            return False
        
        # Ensure we're comparing timezone-aware datetimes
        now = datetime.now(timezone.utc)
        due_date = self.due_date
        
        # If due_date is naive, assume UTC
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
        
        return now > due_date
    
    def __repr__(self) -> str:
        """String representation for debugging purposes."""
        return (
            f"<Task(id={self.id}, title='{self.title}', "
            f"status={self.status.value}, priority={self.priority.value}, "
            f"user_id={self.user_id})>"
        )
    
    def __str__(self) -> str:
        """Human-readable string representation."""
        return f"Task: {self.title} ({self.status.value})"