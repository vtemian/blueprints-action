"""
FastAPI Task Management API Module

This module provides RESTful endpoints for task management operations including
CRUD operations, filtering, pagination, and task completion tracking.
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models.task import Task, TaskStatus, TaskPriority
from core.auth import get_current_user
from core.database import get_db


# Initialize router
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# Pydantic Models
class TaskBase(BaseModel):
    """Base task model with common fields"""
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: str = Field(..., min_length=1, max_length=1000, description="Task description")
    priority: Optional[TaskPriority] = Field(TaskPriority.MEDIUM, description="Task priority level")
    due_date: Optional[datetime] = Field(None, description="Task due date")

    @validator('title', 'description')
    def validate_strings(cls, v):
        if v and not v.strip():
            raise ValueError('Field cannot be empty or whitespace only')
        return v.strip() if v else v

    @validator('due_date')
    def validate_due_date(cls, v):
        if v and v < datetime.now():
            raise ValueError('Due date cannot be in the past')
        return v


class TaskCreate(TaskBase):
    """Model for task creation"""
    pass


class TaskUpdate(BaseModel):
    """Model for task updates - all fields optional"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1, max_length=1000)
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    status: Optional[TaskStatus] = None

    @validator('title', 'description')
    def validate_strings(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Field cannot be empty or whitespace only')
        return v.strip() if v else v

    @validator('due_date')
    def validate_due_date(cls, v):
        if v and v < datetime.now():
            raise ValueError('Due date cannot be in the past')
        return v


class TaskResponse(BaseModel):
    """Model for task responses"""
    id: int
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    user_id: int

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """Model for paginated task list responses"""
    tasks: List[TaskResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class User(BaseModel):
    """User model for dependency injection"""
    id: int
    email: str
    is_active: bool

    class Config:
        from_attributes = True


# Dependency Functions
async def get_task_with_ownership(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Task:
    """
    Retrieve a task and verify ownership by the current user.
    
    Args:
        task_id: The ID of the task to retrieve
        current_user: The authenticated user
        db: Database session
        
    Returns:
        Task: The requested task
        
    Raises:
        HTTPException: If task not found or user doesn't own the task
    """
    try:
        task = db.query(Task).filter(
            and_(
                Task.id == task_id,
                Task.is_deleted == False
            )
        ).first()
        
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )
        
        if task.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this task"
            )
        
        return task
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


def validate_pagination_params(
    page: int = Query(1, ge=1, description="Page number (starts from 1)"),
    limit: int = Query(20, ge=1, le=100, description="Number of items per page (max 100)")
) -> tuple[int, int]:
    """Validate and return pagination parameters"""
    return page, limit


# API Endpoints
@router.get("/", response_model=TaskListResponse)
async def list_tasks(
    status: Optional[TaskStatus] = Query(None, description="Filter by task status"),
    priority: Optional[TaskPriority] = Query(None, description="Filter by task priority"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date"),
    pagination: tuple[int, int] = Depends(validate_pagination_params),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve a paginated list of tasks for the authenticated user with optional filtering.
    
    Supports filtering by status, priority, and due date ranges.
    """
    try:
        page, limit = pagination
        offset = (page - 1) * limit
        
        # Build base query
        query = db.query(Task).filter(
            and_(
                Task.user_id == current_user.id,
                Task.is_deleted == False
            )
        )
        
        # Apply filters
        if status:
            query = query.filter(Task.status == status)
        
        if priority:
            query = query.filter(Task.priority == priority)
        
        if due_before:
            query = query.filter(Task.due_date <= due_before)
        
        if due_after:
            query = query.filter(Task.due_date >= due_after)
        
        # Validate date range
        if due_before and due_after and due_after > due_before:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="due_after cannot be later than due_before"
            )
        
        # Get total count for pagination
        total = query.count()
        
        # Apply pagination and ordering
        tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
        
        total_pages = (total + limit - 1) // limit
        
        return TaskListResponse(
            tasks=tasks,
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task: Task = Depends(get_task_with_ownership)
):
    """Retrieve a specific task by ID with ownership verification."""
    return task


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new task for the authenticated user."""
    try:
        # Create new task instance
        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            priority=task_data.priority,
            due_date=task_data.due_date,
            status=TaskStatus.PENDING,
            user_id=current_user.id,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        
        return new_task
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create task"
        )


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_data: TaskUpdate,
    task: Task = Depends(get_task_with_ownership),
    db: Session = Depends(get_db)
):
    """Update an existing task with ownership verification."""
    try:
        # Update only provided fields
        update_data = task_data.dict(exclude_unset=True)
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update"
            )
        
        # Prevent user_id changes
        if 'user_id' in update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change task ownership"
            )
        
        # Apply updates
        for field, value in update_data.items():
            setattr(task, field, value)
        
        task.updated_at = datetime.now()
        
        db.commit()
        db.refresh(task)
        
        return task
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update task"
        )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task: Task = Depends(get_task_with_ownership),
    db: Session = Depends(get_db)
):
    """Soft delete a task with ownership verification."""
    try:
        # Perform soft delete
        task.is_deleted = True
        task.updated_at = datetime.now()
        
        db.commit()
        
        return Response(status_code=status.HTTP_204_NO_CONTENT)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete task"
        )


@router.post("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task: Task = Depends(get_task_with_ownership),
    db: Session = Depends(get_db)
):
    """Mark a task as completed with timestamp."""
    try:
        if task.status == TaskStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task is already completed"
            )
        
        # Mark as completed
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now()
        task.updated_at = datetime.now()
        
        db.commit()
        db.refresh(task)
        
        return task
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete task"
        )