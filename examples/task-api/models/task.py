"""
Task model for the application.

This module defines the Task SQLAlchemy model with all required fields,
relationships, and business logic methods.
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class TaskStatus(PyEnum):
    """Enumeration for task status values."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(PyEnum):
    """Enumeration for task priority values."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base):
    """
    Task model representing a user task with status tracking and due dates.
    
    This model handles task management including status updates, priority levels,
    and automatic timestamp tracking for creation, updates, and completion.
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
        nullable=False
    )
    
    description = Column(
        Text,
        nullable=True
    )
    
    status = Column(
        Enum(TaskStatus),
        nullable=False,
        default=TaskStatus.PENDING
    )
    
    priority = Column(
        Enum(TaskPriority),
        nullable=False,
        default=TaskPriority.MEDIUM
    )
    
    # Foreign key relationship
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False
    )
    
    # Date fields
    due_date = Column(
        DateTime,
        nullable=True
    )
    
    completed_at = Column(
        DateTime,
        nullable=True
    )
    
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow
    )
    
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )
    
    # Relationships
    user = relationship(
        "User",
        back_populates="tasks"
    )
    
    # Indexes
    __table_args__ = (
        Index("idx_task_user_id", "user_id"),
        Index("idx_task_status", "status"),
        Index("idx_task_due_date", "due_date"),
    )
    
    def mark_complete(self) -> None:
        """
        Mark the task as completed and set the completion timestamp.
        
        Updates the task status to 'completed' and sets the completed_at
        field to the current UTC datetime.
        """
        self.status = TaskStatus.COMPLETED
        self.completed_at = datetime.utcnow()
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue based on its due date.
        
        Returns:
            bool: True if the task has a due_date and it's in the past,
                  False if no due_date is set or the due_date is in the future.
        """
        if self.due_date is None:
            return False
        
        return datetime.utcnow() > self.due_date
    
    def __repr__(self) -> str:
        """String representation of the Task instance."""
        return f"<Task(id={self.id}, title='{self.title}', status='{self.status.value}')>"
    
    def __str__(self) -> str:
        """Human-readable string representation of the Task instance."""
        return f"Task: {self.title} ({self.status.value})"