"""
Task Management API Module

This module provides FastAPI endpoints for task management operations including
CRUD operations, filtering, pagination, and task completion tracking.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.exc import SQLAlchemyError

from models.task import Task, TaskStatus, TaskPriority
from core.auth import get_current_user
from core.database import get_db_session


# Initialize router
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# Pydantic Models
class TaskBase(BaseModel):
    """Base task model with common fields"""
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: str = Field(..., min_length=1, max_length=2000, description="Task description")
    priority: Optional[TaskPriority] = Field(default=TaskPriority.MEDIUM, description="Task priority")
    due_date: Optional[datetime] = Field(default=None, description="Task due date")

    @validator('title', 'description')
    def validate_strings(cls, v):
        """Validate string fields are not empty or whitespace only"""
        if not v or not v.strip():
            raise ValueError('Field cannot be empty or whitespace only')
        return v.strip()

    @validator('due_date')
    def validate_due_date(cls, v):
        """Validate due date is not in the past"""
        if v and v < datetime.utcnow():
            raise ValueError('Due date cannot be in the past')
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
    def validate_strings(cls, v):
        """Validate string fields are not empty or whitespace only"""
        if v is not None and (not v or not v.strip()):
            raise ValueError('Field cannot be empty or whitespace only')
        return v.strip() if v else v

    @validator('due_date')
    def validate_due_date(cls, v):
        """Validate due date is not in the past"""
        if v and v < datetime.utcnow():
            raise ValueError('Due date cannot be in the past')
        return v


class TaskResponse(BaseModel):
    """Model for task response"""
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
    total_pages: int


class TaskFilters(BaseModel):
    """Model for task filtering parameters"""
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_before: Optional[datetime] = None
    due_after: Optional[datetime] = None

    @validator('due_before', 'due_after')
    def validate_dates(cls, v):
        """Validate date filters"""
        return v


# Utility Functions
async def get_task_by_id_and_user(
    task_id: int, 
    user_id: int, 
    db: AsyncSession
) -> Task:
    """
    Retrieve a task by ID and verify ownership.
    
    Args:
        task_id: The task ID to retrieve
        user_id: The user ID to verify ownership
        db: Database session
        
    Returns:
        Task object if found and owned by user
        
    Raises:
        HTTPException: 404 if task not found or not owned by user
    """
    try:
        query = select(Task).where(
            and_(
                Task.id == task_id,
                Task.user_id == user_id,
                Task.is_deleted == False
            )
        )
        result = await db.execute(query)
        task = result.scalar_one_or_none()
        
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )
        
        return task
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


def build_task_filters(filters: TaskFilters, user_id: int):
    """
    Build SQLAlchemy filter conditions for task queries.
    
    Args:
        filters: TaskFilters object with filter parameters
        user_id: User ID for ownership filtering
        
    Returns:
        List of SQLAlchemy filter conditions
    """
    conditions = [
        Task.user_id == user_id,
        Task.is_deleted == False
    ]
    
    if filters.status:
        conditions.append(Task.status == filters.status)
    
    if filters.priority:
        conditions.append(Task.priority == filters.priority)
    
    if filters.due_before:
        conditions.append(Task.due_date <= filters.due_before)
    
    if filters.due_after:
        conditions.append(Task.due_date >= filters.due_after)
    
    return conditions


# API Endpoints
@router.get("/", response_model=TaskListResponse)
async def list_tasks(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    status: Optional[TaskStatus] = Query(None, description="Filter by status"),
    priority: Optional[TaskPriority] = Query(None, description="Filter by priority"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Retrieve a paginated list of tasks with optional filtering.
    
    - **page**: Page number (starts from 1)
    - **limit**: Number of items per page (max 100)
    - **status**: Filter by task status
    - **priority**: Filter by task priority
    - **due_before**: Filter tasks due before this date
    - **due_after**: Filter tasks due after this date
    """
    try:
        # Build filters
        filters = TaskFilters(
            status=status,
            priority=priority,
            due_before=due_before,
            due_after=due_after
        )
        
        conditions = build_task_filters(filters, current_user["id"])
        
        # Count total tasks
        count_query = select(Task).where(and_(*conditions))
        count_result = await db.execute(count_query)
        total = len(count_result.scalars().all())
        
        # Calculate pagination
        offset = (page - 1) * limit
        total_pages = (total + limit - 1) // limit
        
        # Get paginated tasks
        query = (
            select(Task)
            .where(and_(*conditions))
            .order_by(Task.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        
        result = await db.execute(query)
        tasks = result.scalars().all()
        
        return TaskListResponse(
            tasks=[TaskResponse.from_orm(task) for task in tasks],
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages
        )
        
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Retrieve a specific task by ID.
    
    - **task_id**: The ID of the task to retrieve
    """
    task = await get_task_by_id_and_user(task_id, current_user["id"], db)
    return TaskResponse.from_orm(task)


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Create a new task.
    
    - **title**: Task title (required)
    - **description**: Task description (required)
    - **priority**: Task priority (optional, defaults to MEDIUM)
    - **due_date**: Task due date (optional)
    """
    try:
        # Create new task
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
        
        db.add(new_task)
        await db.commit()
        await db.refresh(new_task)
        
        return TaskResponse.from_orm(new_task)
        
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create task"
        )


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Update an existing task.
    
    - **task_id**: The ID of the task to update
    - **title**: New task title (optional)
    - **description**: New task description (optional)
    - **priority**: New task priority (optional)
    - **due_date**: New task due date (optional)
    - **status**: New task status (optional)
    """
    try:
        # Get existing task
        task = await get_task_by_id_and_user(task_id, current_user["id"], db)
        
        # Update fields if provided
        update_data = task_data.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(task, field, value)
        
        task.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update task"
        )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Soft delete a task (mark as deleted without removing from database).
    
    - **task_id**: The ID of the task to delete
    """
    try:
        # Get existing task
        task = await get_task_by_id_and_user(task_id, current_user["id"], db)
        
        # Soft delete
        task.is_deleted = True
        task.updated_at = datetime.utcnow()
        
        await db.commit()
        
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete task"
        )


@router.post("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Mark a task as completed with timestamp.
    
    - **task_id**: The ID of the task to complete
    """
    try:
        # Get existing task
        task = await get_task_by_id_and_user(task_id, current_user["id"], db)
        
        # Check if already completed
        if task.status == TaskStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task is already completed"
            )
        
        # Mark as completed
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.utcnow()
        task.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete task"
        )