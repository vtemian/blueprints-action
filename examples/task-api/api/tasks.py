"""
Task management API endpoints module.
Provides CRUD operations for tasks with authentication and authorization.
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from pydantic import BaseModel, Field, validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.exc import SQLAlchemyError

from models.task import Task, TaskStatus, TaskPriority
from core.auth import get_current_user
from core.database import get_db_session


# Pydantic Models for Request/Response Validation
class TaskBase(BaseModel):
    """Base task model with common fields."""
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: str = Field(..., min_length=1, max_length=2000, description="Task description")
    priority: Optional[TaskPriority] = Field(default=TaskPriority.MEDIUM, description="Task priority")
    due_date: Optional[datetime] = Field(default=None, description="Task due date")

    @validator('due_date')
    def validate_due_date(cls, v):
        """Ensure due date is in the future and timezone-aware."""
        if v is not None:
            if v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            if v <= datetime.now(timezone.utc):
                raise ValueError("Due date must be in the future")
        return v

    class Config:
        use_enum_values = True


class TaskCreate(TaskBase):
    """Model for creating a new task."""
    pass


class TaskUpdate(BaseModel):
    """Model for updating an existing task."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1, max_length=2000)
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    status: Optional[TaskStatus] = None

    @validator('due_date')
    def validate_due_date(cls, v):
        """Ensure due date is in the future and timezone-aware."""
        if v is not None:
            if v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            if v <= datetime.now(timezone.utc):
                raise ValueError("Due date must be in the future")
        return v

    class Config:
        use_enum_values = True


class TaskResponse(BaseModel):
    """Model for task response data."""
    id: UUID
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    user_id: UUID

    class Config:
        from_attributes = True
        use_enum_values = True


class TaskListResponse(BaseModel):
    """Model for paginated task list response."""
    tasks: List[TaskResponse]
    total: int
    page: int
    limit: int
    has_next: bool
    has_prev: bool


class TaskFilters(BaseModel):
    """Model for task filtering parameters."""
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_before: Optional[datetime] = None
    due_after: Optional[datetime] = None

    @validator('due_before', 'due_after')
    def validate_dates(cls, v):
        """Ensure dates are timezone-aware."""
        if v is not None and v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v


# Router setup
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# Dependency functions
async def get_task_by_id(
    task_id: UUID = Path(..., description="Task ID"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> Task:
    """
    Get task by ID with ownership verification.
    Returns 404 if task doesn't exist or user doesn't own it.
    """
    try:
        query = select(Task).where(
            and_(
                Task.id == task_id,
                Task.user_id == current_user["id"],
                Task.deleted_at.is_(None)
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


# API Endpoints
@router.get("/", response_model=TaskListResponse, status_code=status.HTTP_200_OK)
async def list_tasks(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[TaskStatus] = Query(None, alias="status", description="Filter by status"),
    priority_filter: Optional[TaskPriority] = Query(None, alias="priority", description="Filter by priority"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> TaskListResponse:
    """
    List tasks with filtering and pagination.
    Only returns tasks owned by the current user.
    """
    try:
        # Validate date filters
        if due_before and due_before.tzinfo is None:
            due_before = due_before.replace(tzinfo=timezone.utc)
        if due_after and due_after.tzinfo is None:
            due_after = due_after.replace(tzinfo=timezone.utc)

        # Build base query
        query = select(Task).where(
            and_(
                Task.user_id == current_user["id"],
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
            query = query.where(and_(*filters))

        # Get total count
        count_query = select(Task.id).where(query.whereclause)
        count_result = await db.execute(count_query)
        total = len(count_result.fetchall())

        # Apply pagination
        offset = (page - 1) * limit
        query = query.offset(offset).limit(limit).order_by(Task.created_at.desc())

        # Execute query
        result = await db.execute(query)
        tasks = result.scalars().all()

        # Calculate pagination info
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

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )


@router.get("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def get_task(
    task: Task = Depends(get_task_by_id)
) -> TaskResponse:
    """Get a single task by ID."""
    return TaskResponse.from_orm(task)


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> TaskResponse:
    """Create a new task."""
    try:
        # Create new task instance
        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            priority=task_data.priority or TaskPriority.MEDIUM,
            due_date=task_data.due_date,
            status=TaskStatus.PENDING,
            user_id=current_user["id"],
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

        # Save to database
        db.add(new_task)
        await db.commit()
        await db.refresh(new_task)

        return TaskResponse.from_orm(new_task)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create task"
        )


@router.put("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def update_task(
    task_data: TaskUpdate,
    task: Task = Depends(get_task_by_id),
    db: AsyncSession = Depends(get_db_session)
) -> TaskResponse:
    """Update an existing task."""
    try:
        # Update only provided fields
        update_data = task_data.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            if hasattr(task, field):
                setattr(task, field, value)

        # Update timestamp
        task.updated_at = datetime.now(timezone.utc)

        # Save changes
        await db.commit()
        await db.refresh(task)

        return TaskResponse.from_orm(task)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update task"
        )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task: Task = Depends(get_task_by_id),
    db: AsyncSession = Depends(get_db_session)
) -> None:
    """Soft delete a task."""
    try:
        # Soft delete by setting deleted_at timestamp
        task.deleted_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)

        await db.commit()

    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete task"
        )


@router.post("/{task_id}/complete", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def complete_task(
    task: Task = Depends(get_task_by_id),
    db: AsyncSession = Depends(get_db_session)
) -> TaskResponse:
    """Mark a task as completed."""
    try:
        # Check if task is already completed
        if task.status == TaskStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Task is already completed"
            )

        # Update task status and completion timestamp
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(task)

        return TaskResponse.from_orm(task)

    except HTTPException:
        raise
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete task"
        )


# Export router for inclusion in main app
__all__ = ["router"]