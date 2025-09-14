"""
Task Management API Module

This module provides REST API endpoints for task management operations
including CRUD operations, filtering, pagination, and task completion tracking.
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models.task import Task, TaskStatus, TaskPriority
from core.auth import get_current_user, User
from core.database import get_db

# Initialize router
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# Pydantic Models
class TaskBase(BaseModel):
    """Base task model with common fields"""
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: str = Field(..., min_length=1, max_length=2000, description="Task description")
    priority: Optional[TaskPriority] = Field(TaskPriority.MEDIUM, description="Task priority level")
    due_date: Optional[datetime] = Field(None, description="Task due date")

    @validator('title', 'description')
    def sanitize_strings(cls, v):
        """Sanitize string inputs by stripping whitespace"""
        if isinstance(v, str):
            return v.strip()
        return v

    @validator('due_date')
    def validate_due_date(cls, v):
        """Ensure due date is in the future"""
        if v and v <= datetime.now(timezone.utc):
            raise ValueError("Due date must be in the future")
        return v


class TaskCreate(TaskBase):
    """Model for creating a new task"""
    pass


class TaskUpdate(BaseModel):
    """Model for updating an existing task"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1, max_length=2000)
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    status: Optional[TaskStatus] = None

    @validator('title', 'description')
    def sanitize_strings(cls, v):
        if v is not None and isinstance(v, str):
            return v.strip()
        return v

    @validator('due_date')
    def validate_due_date(cls, v):
        if v and v <= datetime.now(timezone.utc):
            raise ValueError("Due date must be in the future")
        return v


class TaskResponse(BaseModel):
    """Model for task response data"""
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
    """Model for paginated task list response"""
    tasks: List[TaskResponse]
    total: int
    page: int
    limit: int
    has_next: bool
    has_prev: bool


class TaskCompleteResponse(BaseModel):
    """Model for task completion response"""
    id: int
    status: TaskStatus
    completed_at: datetime

    class Config:
        from_attributes = True


# Dependency Functions
async def get_task_by_id(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Task:
    """
    Retrieve a task by ID with ownership verification
    
    Args:
        task_id: The task ID to retrieve
        current_user: The authenticated user
        db: Database session
        
    Returns:
        Task: The requested task
        
    Raises:
        HTTPException: If task not found or access denied
    """
    task = db.query(Task).filter(
        and_(
            Task.id == task_id,
            Task.deleted_at.is_(None)
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
            detail="Access denied: You don't have permission to access this task"
        )
    
    return task


# API Endpoints
@router.get("/", response_model=TaskListResponse)
async def list_tasks(
    status_filter: Optional[TaskStatus] = Query(None, alias="status", description="Filter by task status"),
    priority_filter: Optional[TaskPriority] = Query(None, alias="priority", description="Filter by task priority"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Number of items per page"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskListResponse:
    """
    Retrieve a paginated list of tasks with optional filtering
    
    Supports filtering by status, priority, and due date ranges.
    Results are paginated with configurable page size (max 100).
    """
    try:
        # Build base query
        query = db.query(Task).filter(
            and_(
                Task.user_id == current_user.id,
                Task.deleted_at.is_(None)
            )
        )
        
        # Apply filters
        filters = []
        
        if status_filter:
            filters.append(Task.status == status_filter)
        
        if priority_filter:
            filters.append(Task.priority == priority_filter)
        
        if due_before:
            filters.append(Task.due_date <= due_before)
        
        if due_after:
            filters.append(Task.due_date >= due_after)
        
        if filters:
            query = query.filter(and_(*filters))
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        offset = (page - 1) * limit
        tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
        
        # Calculate pagination metadata
        has_next = offset + limit < total
        has_prev = page > 1
        
        return TaskListResponse(
            tasks=[TaskResponse.from_orm(task) for task in tasks],
            total=total,
            page=page,
            limit=limit,
            has_next=has_next,
            has_prev=has_prev
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while retrieving tasks"
        )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task: Task = Depends(get_task_by_id)
) -> TaskResponse:
    """
    Retrieve a single task by ID
    
    Requires task ownership verification.
    """
    return TaskResponse.from_orm(task)


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """
    Create a new task
    
    Creates a new task associated with the authenticated user.
    """
    try:
        # Create new task instance
        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            priority=task_data.priority,
            due_date=task_data.due_date,
            status=TaskStatus.PENDING,
            user_id=current_user.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        # Save to database
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        
        return TaskResponse.from_orm(new_task)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to create task"
        )


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_data: TaskUpdate,
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """
    Update an existing task
    
    Updates task fields while preserving ownership and preventing
    unauthorized modifications.
    """
    try:
        # Update only provided fields
        update_data = task_data.dict(exclude_unset=True)
        
        # Prevent user_id changes
        if 'user_id' in update_data:
            del update_data['user_id']
        
        # Apply updates
        for field, value in update_data.items():
            setattr(task, field, value)
        
        # Update timestamp
        task.updated_at = datetime.now(timezone.utc)
        
        # Save changes
        db.commit()
        db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to update task"
        )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> Response:
    """
    Soft delete a task
    
    Marks the task as deleted without removing it from the database.
    """
    try:
        # Perform soft delete
        task.deleted_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        
        return Response(status_code=status.HTTP_204_NO_CONTENT)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete task"
        )


@router.post("/{task_id}/complete", response_model=TaskCompleteResponse)
async def complete_task(
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> TaskCompleteResponse:
    """
    Mark a task as completed
    
    Updates the task status to completed and records the completion timestamp.
    """
    try:
        # Check if task is already completed
        if task.status == TaskStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Task is already completed"
            )
        
        # Mark as completed
        completion_time = datetime.now(timezone.utc)
        task.status = TaskStatus.COMPLETED
        task.completed_at = completion_time
        task.updated_at = completion_time
        
        db.commit()
        db.refresh(task)
        
        return TaskCompleteResponse(
            id=task.id,
            status=task.status,
            completed_at=task.completed_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete task"
        )


# Error handlers for common scenarios
@router.exception_handler(ValueError)
async def value_error_handler(request, exc):
    """Handle validation errors"""
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=str(exc)
    )


# Health check endpoint for the tasks module
@router.get("/health", include_in_schema=False)
async def tasks_health_check():
    """Health check endpoint for tasks module"""
    return {"status": "healthy", "module": "tasks"}