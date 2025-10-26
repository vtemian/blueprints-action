from datetime import datetime
from enum import Enum as PyEnum
from uuid import uuid4
from typing import Optional

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Index, Enum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.exc import SQLAlchemyError

from core.database import Base


class TaskStatus(PyEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(PyEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(Base):
    __tablename__ = "tasks"
    
    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        nullable=False
    )
    
    # Task details
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # Status and priority
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
    
    # Foreign key to User
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False
    )
    
    # Timestamps
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )
    
    # Relationships
    user = relationship("User", back_populates="tasks", lazy="select")
    
    # Database indexes
    __table_args__ = (
        Index("idx_task_user_id", "user_id"),
        Index("idx_task_status", "status"),
        Index("idx_task_priority", "priority"),
        Index("idx_task_due_date", "due_date"),
        Index("idx_task_created_at", "created_at"),
        Index("idx_task_user_status", "user_id", "status"),
    )
    
    def __repr__(self) -> str:
        return (
            f"<Task(id={self.id}, title='{self.title}', "
            f"status={self.status.value}, priority={self.priority.value}, "
            f"user_id={self.user_id})>"
        )
    
    def mark_complete(self, session=None) -> bool:
        """
        Mark the task as completed and set completion timestamp.
        
        Args:
            session: SQLAlchemy session object. If None, assumes session
                    management is handled externally.
        
        Returns:
            bool: True if task was successfully marked complete, False if
                  task was already completed.
        
        Raises:
            SQLAlchemyError: If database operation fails.
        """
        # Check if task is already completed
        if self.status == TaskStatus.COMPLETED:
            return False
        
        try:
            # Update task status and completion time
            self.status = TaskStatus.COMPLETED
            self.completed_at = datetime.utcnow()
            
            # Commit if session is provided
            if session:
                session.commit()
            
            return True
            
        except SQLAlchemyError as e:
            if session:
                session.rollback()
            raise e
    
    def is_overdue(self) -> bool:
        """
        Check if the task is overdue.
        
        Returns:
            bool: True if task has a due_date and it's in the past,
                  False otherwise (including when due_date is None
                  or task is already completed).
        """
        # No due date means not overdue
        if self.due_date is None:
            return False
        
        # Completed tasks are not considered overdue
        if self.status == TaskStatus.COMPLETED:
            return False
        
        # Check if due date is in the past
        return datetime.utcnow() > self.due_date
    
    @property
    def is_completed(self) -> bool:
        """Check if task is completed."""
        return self.status == TaskStatus.COMPLETED
    
    @property
    def days_until_due(self) -> Optional[int]:
        """
        Calculate days until due date.
        
        Returns:
            int: Number of days until due (negative if overdue),
                 None if no due date is set.
        """
        if self.due_date is None:
            return None
        
        delta = self.due_date - datetime.utcnow()
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