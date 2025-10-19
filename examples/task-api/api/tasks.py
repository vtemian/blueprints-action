"""
Task management API endpoints module.

This module provides REST API endpoints for task CRUD operations with
authentication, authorization, and proper data validation.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session

from models.task import Task, TaskStatus, TaskPriority
from core.auth import get_current_user
from core.database import get_db


# Pydantic Models
class TaskBase(BaseModel):
    """Base task model with common fields."""
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: str = Field(..., min_length=1, max_length=1000, description="Task description")
    priority: Optional[TaskPriority] = Field(default=TaskPriority.MEDIUM, description="Task priority")
    due_date: Optional[datetime] = Field(default=None, description="Task due date")

    @validator('due_date')
    def validate_due_date(cls, v):
        """Validate that due date is not in the past."""
        if v and v < datetime.utcnow():
            raise ValueError('Due date cannot be in the past')
        return v


class TaskCreate(TaskBase):
    """Model for creating a new task."""
    pass


class TaskUpdate(BaseModel):
    """Model for updating an existing task."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1, max_length=1000)
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    status: Optional[TaskStatus] = None

    @validator('due_date')
    def validate_due_date(cls, v):
        """Validate that due date is not in the past."""
        if v and v < datetime.utcnow():
            raise ValueError('Due date cannot be in the past')
        return v


class TaskResponse(BaseModel):
    """Model for task response data."""
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
    """Model for paginated task list response."""
    tasks: List[TaskResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class TaskCompleteResponse(BaseModel):
    """Model for task completion response."""
    id: int
    status: TaskStatus
    completed_at: datetime

    class Config:
        from_attributes = True


# Router initialization
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# Dependency functions
async def get_task_by_id(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Task:
    """
    Get task by ID with ownership verification.
    
    Args:
        task_id: The task ID to retrieve
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Task object if found and owned by user
        
    Raises:
        HTTPException: If task not found or access denied
    """
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.is_deleted == False
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    if task.user_id != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You don't own this task"
        )
    
    return task


# API Endpoints
@router.get("/", response_model=TaskListResponse, status_code=status.HTTP_200_OK)
async def list_tasks(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    status_filter: Optional[TaskStatus] = Query(None, alias="status", description="Filter by task status"),
    priority: Optional[TaskPriority] = Query(None, description="Filter by task priority"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskListResponse:
    """
    Retrieve a paginated list of user's tasks with optional filtering.
    
    Supports filtering by status, priority, and due date range.
    Results are paginated with configurable page size (max 100 items).
    """
    try:
        # Build base query
        query = db.query(Task).filter(
            Task.user_id == current_user["id"],
            Task.is_deleted == False
        )
        
        # Apply filters
        if status_filter:
            query = query.filter(Task.status == status_filter)
        
        if priority:
            query = query.filter(Task.priority == priority)
        
        if due_before:
            query = query.filter(Task.due_date <= due_before)
        
        if due_after:
            query = query.filter(Task.due_date >= due_after)
        
        # Get total count for pagination
        total = query.count()
        
        # Apply pagination
        offset = (page - 1) * limit
        tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
        
        # Calculate total pages
        total_pages = (total + limit - 1) // limit
        
        return TaskListResponse(
            tasks=tasks,
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error processing request: {str(e)}"
        )


@router.get("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def get_task(
    task: Task = Depends(get_task_by_id)
) -> TaskResponse:
    """
    Retrieve a specific task by ID.
    
    Requires task ownership by the authenticated user.
    """
    return TaskResponse.from_orm(task)


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """
    Create a new task for the authenticated user.
    
    Requires title and description. Priority defaults to MEDIUM if not specified.
    """
    try:
        # Create new task instance
        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            priority=task_data.priority or TaskPriority.MEDIUM,
            due_date=task_data.due_date,
            status=TaskStatus.PENDING,
            user_id=current_user["id"],
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error creating task: {str(e)}"
        )


@router.put("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def update_task(
    task_data: TaskUpdate,
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """
    Update an existing task.
    
    Only updates provided fields. Requires task ownership by authenticated user.
    User ID cannot be changed through this endpoint.
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
        task.updated_at = datetime.utcnow()
        
        # Save changes
        db.commit()
        db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error updating task: {str(e)}"
        )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> None:
    """
    Soft delete a task.
    
    Marks the task as deleted instead of removing it from the database.
    Requires task ownership by authenticated user.
    """
    try:
        # Perform soft delete
        task.is_deleted = True
        task.updated_at = datetime.utcnow()
        
        # Save changes
        db.commit()
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error deleting task: {str(e)}"
        )


@router.post("/{task_id}/complete", response_model=TaskCompleteResponse, status_code=status.HTTP_200_OK)
async def complete_task(
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> TaskCompleteResponse:
    """
    Mark a task as completed.
    
    Sets the task status to COMPLETED and records the completion timestamp.
    Requires task ownership by authenticated user.
    """
    try:
        # Check if task is already completed
        if task.status == TaskStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Task is already completed"
            )
        
        # Mark as completed
        completion_time = datetime.utcnow()
        task.status = TaskStatus.COMPLETED
        task.completed_at = completion_time
        task.updated_at = completion_time
        
        # Save changes
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
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error completing task: {str(e)}"
        )