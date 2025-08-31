"""
Task Management API Module

This module provides comprehensive CRUD operations for task management
with user authentication, ownership validation, and advanced filtering.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_

from models.task import Task, TaskStatus, TaskPriority
from core.auth import get_current_user
from core.database import get_db
from pydantic import BaseModel, Field, validator


# Router setup
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# Pydantic Schemas
class TaskBase(BaseModel):
    """Base task schema with common fields."""
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: str = Field(..., min_length=1, max_length=2000, description="Task description")
    priority: Optional[TaskPriority] = Field(TaskPriority.MEDIUM, description="Task priority")
    due_date: Optional[datetime] = Field(None, description="Task due date")

    @validator('title', 'description')
    def validate_strings(cls, v):
        """Validate and sanitize string fields."""
        if v:
            return v.strip()
        return v

    @validator('due_date')
    def validate_due_date(cls, v):
        """Ensure due date is not in the past."""
        if v and v < datetime.utcnow():
            raise ValueError('Due date cannot be in the past')
        return v


class TaskCreate(TaskBase):
    """Schema for creating a new task."""
    pass


class TaskUpdate(BaseModel):
    """Schema for updating an existing task."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1, max_length=2000)
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    status: Optional[TaskStatus] = None

    @validator('title', 'description')
    def validate_strings(cls, v):
        """Validate and sanitize string fields."""
        if v:
            return v.strip()
        return v

    @validator('due_date')
    def validate_due_date(cls, v):
        """Ensure due date is not in the past."""
        if v and v < datetime.utcnow():
            raise ValueError('Due date cannot be in the past')
        return v


class TaskResponse(BaseModel):
    """Schema for task response."""
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
    """Schema for paginated task list response."""
    tasks: List[TaskResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class ErrorResponse(BaseModel):
    """Schema for error responses."""
    detail: str
    error_code: Optional[str] = None


# Helper Functions
async def get_task_by_id_and_user(
    task_id: int, 
    user_id: int, 
    db: Session,
    include_deleted: bool = False
) -> Task:
    """
    Retrieve a task by ID and verify ownership.
    
    Args:
        task_id: The task ID to retrieve
        user_id: The user ID to verify ownership
        db: Database session
        include_deleted: Whether to include soft-deleted tasks
        
    Returns:
        Task object if found and owned by user
        
    Raises:
        HTTPException: 404 if task not found or not owned by user
    """
    query = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == user_id
    )
    
    if not include_deleted:
        query = query.filter(Task.deleted_at.is_(None))
    
    task = query.first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found or you don't have permission to access it"
        )
    
    return task


def build_task_filters(
    user_id: int,
    status: Optional[TaskStatus] = None,
    priority: Optional[TaskPriority] = None,
    due_before: Optional[datetime] = None,
    due_after: Optional[datetime] = None
) -> List[Any]:
    """
    Build database filters for task queries.
    
    Args:
        user_id: User ID to filter by
        status: Optional status filter
        priority: Optional priority filter
        due_before: Optional due date upper bound
        due_after: Optional due date lower bound
        
    Returns:
        List of SQLAlchemy filter conditions
    """
    filters = [
        Task.user_id == user_id,
        Task.deleted_at.is_(None)
    ]
    
    if status:
        filters.append(Task.status == status)
    
    if priority:
        filters.append(Task.priority == priority)
    
    if due_before:
        filters.append(Task.due_date <= due_before)
    
    if due_after:
        filters.append(Task.due_date >= due_after)
    
    return filters


# API Endpoints
@router.get(
    "",
    response_model=TaskListResponse,
    summary="List user's tasks",
    description="Retrieve a paginated list of tasks with optional filtering"
)
async def list_tasks(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[TaskStatus] = Query(None, description="Filter by task status"),
    priority: Optional[TaskPriority] = Query(None, description="Filter by task priority"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskListResponse:
    """List user's tasks with filtering and pagination."""
    try:
        # Validate date range
        if due_before and due_after and due_before < due_after:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="due_before must be greater than due_after"
            )
        
        # Build filters
        filters = build_task_filters(
            user_id=current_user["id"],
            status=status,
            priority=priority,
            due_before=due_before,
            due_after=due_after
        )
        
        # Get total count
        total = db.query(Task).filter(and_(*filters)).count()
        
        # Calculate pagination
        offset = (page - 1) * limit
        total_pages = (total + limit - 1) // limit
        
        # Get tasks with pagination
        tasks = (
            db.query(Task)
            .filter(and_(*filters))
            .order_by(Task.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        
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
            detail="An error occurred while retrieving tasks"
        )


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Get single task",
    description="Retrieve a specific task by ID"
)
async def get_task(
    task_id: int = Path(..., description="Task ID"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """Get a single task by ID."""
    try:
        task = await get_task_by_id_and_user(task_id, current_user["id"], db)
        return TaskResponse.from_orm(task)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while retrieving the task"
        )


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new task",
    description="Create a new task for the authenticated user"
)
async def create_task(
    task_data: TaskCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """Create a new task."""
    try:
        # Create new task instance
        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            priority=task_data.priority,
            due_date=task_data.due_date,
            user_id=current_user["id"],
            status=TaskStatus.PENDING,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        # Save to database
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        
        return TaskResponse.from_orm(new_task)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while creating the task"
        )


@router.put(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Update task",
    description="Update an existing task"
)
async def update_task(
    task_data: TaskUpdate,
    task_id: int = Path(..., description="Task ID"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """Update an existing task."""
    try:
        # Get existing task and verify ownership
        task = await get_task_by_id_and_user(task_id, current_user["id"], db)
        
        # Update fields if provided
        update_data = task_data.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(task, field, value)
        
        # Update timestamp
        task.updated_at = datetime.utcnow()
        
        # Save changes
        db.commit()
        db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while updating the task"
        )


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete task",
    description="Soft delete a task (sets deleted_at timestamp)"
)
async def delete_task(
    task_id: int = Path(..., description="Task ID"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Response:
    """Soft delete a task."""
    try:
        # Get existing task and verify ownership
        task = await get_task_by_id_and_user(task_id, current_user["id"], db)
        
        # Soft delete by setting deleted_at timestamp
        task.deleted_at = datetime.utcnow()
        task.updated_at = datetime.utcnow()
        
        # Save changes
        db.commit()
        
        return Response(status_code=status.HTTP_204_NO_CONTENT)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while deleting the task"
        )


@router.post(
    "/{task_id}/complete",
    response_model=TaskResponse,
    summary="Mark task as complete",
    description="Mark a task as completed and set completion timestamp"
)
async def complete_task(
    task_id: int = Path(..., description="Task ID"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """Mark a task as completed."""
    try:
        # Get existing task and verify ownership
        task = await get_task_by_id_and_user(task_id, current_user["id"], db)
        
        # Check if task is already completed
        if task.status == TaskStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task is already completed"
            )
        
        # Mark as completed
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.utcnow()
        task.updated_at = datetime.utcnow()
        
        # Save changes
        db.commit()
        db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while completing the task"
        )