"""
Task model for the task management system.

This module defines the Task SQLAlchemy model with complete ORM implementation
including relationships, enums, methods, and database indexes.
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Index, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

try:
    from sqlalchemy.dialects.postgresql import UUID
    UUID_TYPE = UUID(as_uuid=True)
except ImportError:
    UUID_TYPE = String(36)

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
    Task model representing a task in the task management system.
    
    This model includes status tracking, priority levels, due dates,
    and relationships with users. It provides methods for task completion
    and overdue checking.
    """
    
    __tablename__ = "tasks"
    
    # Primary key
    id = Column(
        UUID_TYPE,
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
        UUID_TYPE,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Date fields
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
        default=func.now(),
        server_default=func.now()
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now()
    )
    
    # Relationships
    user = relationship(
        "User",
        back_populates="tasks",
        lazy="select"
    )
    
    # Database indexes
    __table_args__ = (
        Index("ix_tasks_user_status", "user_id", "status"),
        Index("ix_tasks_due_date_status", "due_date", "status"),
        Index("ix_tasks_priority_status", "priority", "status"),
    )
    
    def __repr__(self) -> str:
        """Return string representation of the task."""
        return (
            f"<Task(id={self.id}, title='{self.title}', "
            f"status={self.status.value}, priority={self.priority.value})>"
        )
    
    def mark_complete(self) -> None:
        """
        Mark the task as completed.
        
        Sets the status to COMPLETED and records the completion timestamp.
        This method is idempotent - safe to call multiple times.
        """
        if self.status != TaskStatus.COMPLETED:
            self.status = TaskStatus.COMPLETED
            self.completed_at = datetime.utcnow()
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue.
        
        Returns:
            bool: True if the task has a due_date that is in the past
                  and the task is not completed, False otherwise.
        """
        if self.due_date is None:
            return False
        
        if self.status == TaskStatus.COMPLETED:
            return False
        
        current_time = datetime.utcnow()
        
        # Handle timezone-aware comparison
        if self.due_date.tzinfo is not None:
            from datetime import timezone
            current_time = current_time.replace(tzinfo=timezone.utc)
        
        return self.due_date < current_time
    
    @property
    def is_completed(self) -> bool:
        """Check if the task is completed."""
        return self.status == TaskStatus.COMPLETED
    
    @property
    def days_until_due(self) -> Optional[int]:
        """
        Calculate days until due date.
        
        Returns:
            Optional[int]: Number of days until due (negative if overdue),
                          None if no due date is set.
        """
        if self.due_date is None:
            return None
        
        current_time = datetime.utcnow()
        
        # Handle timezone-aware comparison
        if self.due_date.tzinfo is not None:
            from datetime import timezone
            current_time = current_time.replace(tzinfo=timezone.utc)
        
        delta = self.due_date.date() - current_time.date()
        return delta.days
    
    def to_dict(self) -> dict:
        """
        Convert task to dictionary representation.
        
        Returns:
            dict: Dictionary containing task data.
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