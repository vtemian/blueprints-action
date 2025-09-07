"""
Task management API endpoints with full CRUD operations.

This module provides RESTful endpoints for managing tasks with proper
authentication, authorization, and data validation.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from models.task import Task, TaskCreate, TaskUpdate, TaskResponse, TaskListResponse
from core.auth import get_current_user
from core.database import get_db

# Initialize router with prefix and tags
router = APIRouter(
    prefix="/api/tasks",
    tags=["tasks"],
    dependencies=[Depends(get_current_user)]
)


@router.get(
    "",
    response_model=TaskListResponse,
    status_code=status.HTTP_200_OK,
    summary="List tasks with filtering and pagination"
)
async def list_tasks(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
    status_filter: Optional[str] = Query(
        None, 
        alias="status",
        description="Filter by task status (pending, in_progress, completed)"
    ),
    priority: Optional[str] = Query(
        None,
        description="Filter by priority (low, medium, high, urgent)"
    ),
    due_before: Optional[datetime] = Query(
        None,
        description="Filter tasks due before this date (ISO format)"
    ),
    due_after: Optional[datetime] = Query(
        None,
        description="Filter tasks due after this date (ISO format)"
    ),
    page: int = Query(
        1,
        ge=1,
        description="Page number (starts from 1)"
    ),
    limit: int = Query(
        20,
        ge=1,
        le=100,
        description="Number of items per page (max 100)"
    )
) -> TaskListResponse:
    """
    Retrieve a paginated list of tasks for the authenticated user.
    
    Supports filtering by status, priority, and due date ranges.
    Results are ordered by creation date (newest first).
    """
    try:
        # Calculate offset for pagination
        offset = (page - 1) * limit
        
        # Build base query for user's tasks
        query = select(Task).where(Task.user_id == current_user.id)
        
        # Apply filters
        filters = []
        
        if status_filter:
            if status_filter not in ["pending", "in_progress", "completed"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid status. Must be one of: pending, in_progress, completed"
                )
            filters.append(Task.status == status_filter)
        
        if priority:
            if priority not in ["low", "medium", "high", "urgent"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid priority. Must be one of: low, medium, high, urgent"
                )
            filters.append(Task.priority == priority)
        
        if due_before:
            filters.append(Task.due_date <= due_before)
        
        if due_after:
            filters.append(Task.due_date >= due_after)
        
        if filters:
            query = query.where(and_(*filters))
        
        # Add soft delete filter (exclude deleted tasks)
        query = query.where(Task.deleted_at.is_(None))
        
        # Get total count for pagination
        count_query = select(Task.id).where(Task.user_id == current_user.id)
        if filters:
            count_query = count_query.where(and_(*filters))
        count_query = count_query.where(Task.deleted_at.is_(None))
        
        total_result = await db.execute(count_query)
        total_count = len(total_result.fetchall())
        
        # Apply ordering, pagination and execute
        query = query.order_by(Task.created_at.desc()).offset(offset).limit(limit)
        result = await db.execute(query)
        tasks = result.scalars().all()
        
        # Calculate pagination metadata
        total_pages = (total_count + limit - 1) // limit
        has_next = page < total_pages
        has_prev = page > 1
        
        return TaskListResponse(
            tasks=tasks,
            total=total_count,
            page=page,
            limit=limit,
            total_pages=total_pages,
            has_next=has_next,
            has_prev=has_prev
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
    status_code=status.HTTP_200_OK,
    summary="Get a single task by ID"
)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> TaskResponse:
    """
    Retrieve a specific task by ID.
    
    Only returns tasks owned by the authenticated user.
    """
    try:
        # Query for the specific task
        query = select(Task).where(
            and_(
                Task.id == task_id,
                Task.user_id == current_user.id,
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
    summary="Create a new task"
)
async def create_task(
    task_data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> TaskResponse:
    """
    Create a new task for the authenticated user.
    
    Required fields: title, description
    Optional fields: priority, due_date
    """
    try:
        # Validate due_date is not in the past
        if task_data.due_date and task_data.due_date < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Due date cannot be in the past"
            )
        
        # Create new task instance
        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            priority=task_data.priority or "medium",
            due_date=task_data.due_date,
            status="pending",
            user_id=current_user.id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        # Add to database
        db.add(new_task)
        await db.commit()
        await db.refresh(new_task)
        
        return TaskResponse.from_orm(new_task)
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while creating the task"
        )


@router.put(
    "/{task_id}",
    response_model=TaskResponse,
    status_code=status.HTTP_200_OK,
    summary="Update an existing task"
)
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> TaskResponse:
    """
    Update an existing task.
    
    Only allows updating tasks owned by the authenticated user.
    User ID cannot be changed.
    """
    try:
        # Find the task
        query = select(Task).where(
            and_(
                Task.id == task_id,
                Task.user_id == current_user.id,
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
        
        # Validate due_date if provided
        if task_data.due_date and task_data.due_date < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Due date cannot be in the past"
            )
        
        # Update fields that are provided
        update_data = task_data.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            if field == "user_id":
                # Prevent user_id changes
                continue
            setattr(task, field, value)
        
        task.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while updating the task"
        )


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task (soft delete)"
)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> Response:
    """
    Soft delete a task by setting the deleted_at timestamp.
    
    Only allows deleting tasks owned by the authenticated user.
    """
    try:
        # Find the task
        query = select(Task).where(
            and_(
                Task.id == task_id,
                Task.user_id == current_user.id,
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
        
        # Soft delete by setting deleted_at timestamp
        task.deleted_at = datetime.utcnow()
        task.updated_at = datetime.utcnow()
        
        await db.commit()
        
        return Response(status_code=status.HTTP_204_NO_CONTENT)
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while deleting the task"
        )


@router.post(
    "/{task_id}/complete",
    response_model=TaskResponse,
    status_code=status.HTTP_200_OK,
    summary="Mark a task as completed"
)
async def complete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> TaskResponse:
    """
    Mark a task as completed by setting the status and completed_at timestamp.
    
    Only allows completing tasks owned by the authenticated user.
    """
    try:
        # Find the task
        query = select(Task).where(
            and_(
                Task.id == task_id,
                Task.user_id == current_user.id,
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
        
        # Check if task is already completed
        if task.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task is already completed"
            )
        
        # Mark as completed
        task.status = "completed"
        task.completed_at = datetime.utcnow()
        task.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(task)
        
        return TaskResponse.from_orm(task)
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while completing the task"
        )


# Additional utility endpoint for task statistics
@router.get(
    "/stats/summary",
    status_code=status.HTTP_200_OK,
    summary="Get task statistics for the current user"
)
async def get_task_stats(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> dict:
    """
    Get summary statistics for the current user's tasks.
    
    Returns counts by status and priority, plus overdue tasks count.
    """
    try:
        # Base query for user's non-deleted tasks
        base_query = select(Task).where(
            and_(
                Task.user_id == current_user.id,
                Task.deleted_at.is_(None)
            )
        )
        
        result = await db.execute(base_query)
        tasks = result.scalars().all()
        
        # Calculate statistics
        stats = {
            "total_tasks": len(tasks),
            "by_status": {
                "pending": 0,
                "in_progress": 0,
                "completed": 0
            },
            "by_priority": {
                "low": 0,
                "medium": 0,
                "high": 0,
                "urgent": 0
            },
            "overdue_tasks": 0
        }
        
        current_time = datetime.utcnow()
        
        for task in tasks:
            # Count by status
            stats["by_status"][task.status] = stats["by_status"].get(task.status, 0) + 1
            
            # Count by priority
            stats["by_priority"][task.priority] = stats["by_priority"].get(task.priority, 0) + 1
            
            # Count overdue tasks
            if (task.due_date and 
                task.due_date < current_time and 
                task.status != "completed"):
                stats["overdue_tasks"] += 1
        
        return stats
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while retrieving task statistics"
        )