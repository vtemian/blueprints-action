"""
Task management API endpoints with full CRUD operations.
Provides comprehensive task management functionality with proper authentication,
authorization, validation, and error handling.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models.task import Task, TaskCreate, TaskUpdate
from core.auth import get_current_user
from core.database import get_db

# Router setup with prefix and tags
router = APIRouter(
    prefix="/api/tasks",
    tags=["tasks"],
    responses={404: {"description": "Not found"}},
)


async def verify_task_ownership(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Task:
    """
    Verify that the current user owns the specified task.
    
    Args:
        task_id: ID of the task to verify
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Task: The task object if ownership is verified
        
    Raises:
        HTTPException: 404 if task not found, 403 if not owned by user
    """
    task = db.query(Task).filter(
        and_(Task.id == task_id, Task.is_deleted == False)
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    if task.user_id != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this task"
        )
    
    return task


@router.get("/", response_model=dict)
async def list_tasks(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by task status"),
    priority: Optional[str] = Query(None, description="Filter by priority level"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve a paginated list of tasks for the current user with optional filtering.
    
    Supports filtering by status, priority, and due date ranges.
    Returns paginated results with metadata.
    """
    try:
        # Base query for user's non-deleted tasks
        query = db.query(Task).filter(
            and_(Task.user_id == current_user["id"], Task.is_deleted == False)
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
        total_count = query.count()
        
        # Apply pagination
        offset = (page - 1) * limit
        tasks = query.offset(offset).limit(limit).all()
        
        # Calculate pagination metadata
        total_pages = (total_count + limit - 1) // limit
        has_next = page < total_pages
        has_prev = page > 1
        
        return {
            "tasks": tasks,
            "pagination": {
                "page": page,
                "limit": limit,
                "total_count": total_count,
                "total_pages": total_pages,
                "has_next": has_next,
                "has_prev": has_prev
            }
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while retrieving tasks"
        )


@router.get("/{task_id}", response_model=Task)
async def get_task(
    task: Task = Depends(verify_task_ownership)
):
    """
    Retrieve a specific task by ID.
    
    Requires task ownership verification.
    """
    return task


@router.post("/", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new task for the current user.
    
    Required fields: title, description
    Optional fields: priority, due_date
    """
    try:
        # Create new task instance
        new_task = Task(
            title=task_data.title,
            description=task_data.description,
            priority=task_data.priority or "medium",
            due_date=task_data.due_date,
            user_id=current_user["id"],
            status="pending",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            is_deleted=False
        )
        
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        
        return new_task
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while creating the task"
        )


@router.put("/{task_id}", response_model=Task)
async def update_task(
    task_data: TaskUpdate,
    task: Task = Depends(verify_task_ownership),
    db: Session = Depends(get_db)
):
    """
    Update an existing task.
    
    Requires task ownership verification.
    Prevents modification of user_id field.
    """
    try:
        # Update only provided fields
        update_data = task_data.dict(exclude_unset=True)
        
        # Prevent user_id changes
        if "user_id" in update_data:
            del update_data["user_id"]
        
        # Update fields
        for field, value in update_data.items():
            setattr(task, field, value)
        
        # Update timestamp
        task.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(task)
        
        return task
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while updating the task"
        )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task: Task = Depends(verify_task_ownership),
    db: Session = Depends(get_db)
):
    """
    Soft delete a task (mark as deleted rather than removing from database).
    
    Requires task ownership verification.
    """
    try:
        # Soft delete - mark as deleted instead of removing
        task.is_deleted = True
        task.updated_at = datetime.utcnow()
        
        db.commit()
        
        return None
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while deleting the task"
        )


@router.post("/{task_id}/complete", response_model=Task)
async def complete_task(
    task: Task = Depends(verify_task_ownership),
    db: Session = Depends(get_db)
):
    """
    Mark a task as completed.
    
    Sets status to 'completed' and records completion timestamp.
    Requires task ownership verification.
    """
    try:
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
        
        db.commit()
        db.refresh(task)
        
        return task
    
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
@router.get("/health", include_in_schema=False)
async def tasks_health_check():
    """Health check endpoint for tasks module."""
    return {"status": "healthy", "module": "tasks"}