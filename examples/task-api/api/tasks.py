"""
Task Management API Module

This module provides FastAPI endpoints for task management operations including
CRUD operations, filtering, pagination, and task completion tracking.
All endpoints require authentication and implement strict ownership verification.
"""

from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models.task import Task, TaskStatus, TaskPriority
from core.auth import get_current_user
from core.database import get_db
from models.user import User

# Initialize FastAPI router
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# Pydantic Models for Request/Response
class TaskCreate(BaseModel):
    """Request model for creating a new task"""
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: str = Field(..., min_length=1, max_length=2000, description="Task description")
    priority: Optional[TaskPriority] = Field(TaskPriority.MEDIUM, description="Task priority level")
    due_date: Optional[datetime] = Field(None, description="Task due date (ISO format)")

    @validator('title', 'description')
    def validate_strings(cls, v):
        """Validate and sanitize string fields"""
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Field cannot be empty or contain only whitespace")
        return v

    @validator('due_date')
    def validate_due_date(cls, v):
        """Validate due date is not in the past"""
        if v and v.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise ValueError("Due date cannot be in the past")
        return v


class TaskUpdate(BaseModel):
    """Request model for updating an existing task"""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="Task title")
    description: Optional[str] = Field(None, min_length=1, max_length=2000, description="Task description")
    priority: Optional[TaskPriority] = Field(None, description="Task priority level")
    due_date: Optional[datetime] = Field(None, description="Task due date (ISO format)")
    status: Optional[TaskStatus] = Field(None, description="Task status")

    @validator('title', 'description')
    def validate_strings(cls, v):
        """Validate and sanitize string fields"""
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Field cannot be empty or contain only whitespace")
        return v

    @validator('due_date')
    def validate_due_date(cls, v):
        """Validate due date is not in the past for new dates"""
        if v and v.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise ValueError("Due date cannot be in the past")
        return v


class TaskResponse(BaseModel):
    """Response model for task data"""
    id: int
    title: str
    description: str
    priority: TaskPriority
    status: TaskStatus
    due_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    user_id: int

    class Config:
        from_attributes = True


class TaskList(BaseModel):
    """Response model for paginated task list"""
    tasks: List[TaskResponse]
    total: int
    page: int
    limit: int
    has_next: bool
    has_prev: bool


# Dependency Functions
async def get_task_by_id(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Task:
    """
    Dependency to get a task by ID with ownership verification.
    
    Args:
        task_id: The task ID to retrieve
        db: Database session
        current_user: Current authenticated user
        
    Returns:
        Task: The requested task
        
    Raises:
        HTTPException: 404 if task not found, 403 if not owned by user
    """
    task = db.query(Task).filter(
        and_(
            Task.id == task_id,
            Task.deleted_at.is_(None)  # Exclude soft-deleted tasks
        )
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Verify ownership
    if task.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this task"
        )
    
    return task


# API Endpoints
@router.get("/", response_model=TaskList, status_code=status.HTTP_200_OK)
async def list_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number (starts from 1)"),
    limit: int = Query(20, ge=1, le=100, description="Number of items per page (max 100)"),
    status_filter: Optional[TaskStatus] = Query(None, alias="status", description="Filter by task status"),
    priority: Optional[TaskPriority] = Query(None, description="Filter by task priority"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date")
) -> TaskList:
    """
    List tasks with filtering and pagination.
    
    Returns paginated list of tasks owned by the current user with optional filtering.
    """
    try:
        # Build base query for user's non-deleted tasks
        query = db.query(Task).filter(
            and_(
                Task.user_id == current_user.id,
                Task.deleted_at.is_(None)
            )
        )
        
        # Apply filters
        if status_filter:
            query = query.filter(Task.status == status_filter)
        
        if priority:
            query = query.filter(Task.priority == priority)
        
        if due_before:
            query = query.filter(Task.due_date < due_before)
        
        if due_after:
            query = query.filter(Task.due_date > due_after)
        
        # Get total count for pagination
        total = query.count()
        
        # Apply pagination and ordering
        offset = (page - 1) * limit
        tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
        
        # Calculate pagination metadata
        has_next = offset + limit < total
        has_prev = page > 1
        
        return TaskList(
            tasks=tasks,
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


@router.get("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def get_task(task: Task = Depends(get_task_by_id)) -> TaskResponse:
    """
    Get a single task by ID.
    
    Returns the task details if the user owns the task.
    """
    return TaskResponse.from_orm(task)


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> TaskResponse:
    """
    Create a new task.
    
    Creates a new task owned by the current user with the provided data.
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
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while creating the task"
        )


@router.put("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def update_task(
    task_data: TaskUpdate,
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """
    Update an existing task.
    
    Updates the task with provided data. User ID cannot be changed.
    Only the task owner can update the task.
    """
    try:
        # Update only provided fields
        update_data = task_data.dict(exclude_unset=True)
        
        # Prevent user_id modification
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
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while updating the task"
        )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> Response:
    """
    Soft delete a task.
    
    Marks the task as deleted by setting deleted_at timestamp.
    Only the task owner can delete the task.
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
            detail="An error occurred while deleting the task"
        )


@router.post("/{task_id}/complete", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def complete_task(
    task: Task = Depends(get_task_by_id),
    db: Session = Depends(get_db)
) -> TaskResponse:
    """
    Mark a task as completed.
    
    Sets the task status to COMPLETED and records the completion timestamp.
    Only the task owner can complete the task.
    """
    try:
        # Check if task is already completed
        if task.status == TaskStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Task is already completed"
            )
        
        # Mark as completed
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while completing the task"
        )


# Health check endpoint for the tasks module
@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """Health check endpoint for the tasks API module"""
    return {"status": "healthy", "module": "tasks", "timestamp": datetime.now(timezone.utc)}