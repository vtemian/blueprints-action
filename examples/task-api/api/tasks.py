from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from typing import Optional, List
from datetime import datetime
from models.task import Task, TaskCreate, TaskUpdate, TaskResponse
from core.auth import get_current_user
from core.database import get_db
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
import uuid
from math import ceil

# Initialize router with prefix and tags
router = APIRouter(
    prefix="/api/tasks",
    tags=["tasks"],
    responses={404: {"description": "Not found"}}
)

# Helper function to validate UUID format
def validate_uuid(task_id: str) -> str:
    """Validate UUID format and return string representation."""
    try:
        uuid.UUID(task_id)
        return task_id
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

# Helper function to verify task ownership
async def get_user_task(
    task_id: str,
    db: Session,
    current_user: dict
) -> Task:
    """Get task by ID and verify ownership."""
    validate_uuid(task_id)
    
    task = db.query(Task).filter(
        and_(
            Task.id == task_id,
            Task.user_id == current_user["id"],
            Task.is_deleted == False
        )
    ).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    return task

@router.get("/", response_model=dict, status_code=status.HTTP_200_OK)
async def list_tasks(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number (starts from 1)"),
    limit: int = Query(10, ge=1, le=100, description="Number of items per page (max 100)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by task status"),
    priority: Optional[str] = Query(None, description="Filter by priority (low, medium, high)"),
    due_before: Optional[datetime] = Query(None, description="Filter tasks due before this date"),
    due_after: Optional[datetime] = Query(None, description="Filter tasks due after this date")
) -> dict:
    """
    Retrieve a paginated list of tasks for the current user with optional filtering.
    
    - **page**: Page number (default: 1)
    - **limit**: Items per page (default: 10, max: 100)
    - **status**: Filter by task status
    - **priority**: Filter by priority level
    - **due_before**: Filter tasks due before specified date
    - **due_after**: Filter tasks due after specified date
    """
    try:
        # Build base query with user ownership filter
        query = db.query(Task).filter(
            and_(
                Task.user_id == current_user["id"],
                Task.is_deleted == False
            )
        )
        
        # Apply filters
        if status_filter:
            query = query.filter(Task.status == status_filter.lower())
        
        if priority:
            if priority.lower() not in ["low", "medium", "high"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Priority must be one of: low, medium, high"
                )
            query = query.filter(Task.priority == priority.lower())
        
        if due_before:
            query = query.filter(Task.due_date < due_before)
        
        if due_after:
            query = query.filter(Task.due_date > due_after)
        
        # Validate date range
        if due_before and due_after and due_after >= due_before:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="due_after must be before due_before"
            )
        
        # Get total count for pagination
        total_count = query.count()
        
        # Calculate pagination
        offset = (page - 1) * limit
        total_pages = ceil(total_count / limit) if total_count > 0 else 1
        
        # Apply pagination and ordering
        tasks = query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
        
        # Convert to response models
        task_responses = [TaskResponse.from_orm(task) for task in tasks]
        
        return {
            "tasks": task_responses,
            "pagination": {
                "page": page,
                "limit": limit,
                "total_count": total_count,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while retrieving tasks"
        )

@router.get("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def get_task(
    task_id: str = Path(..., description="Task ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
) -> TaskResponse:
    """
    Retrieve a specific task by ID.
    
    - **task_id**: UUID of the task to retrieve
    """
    try:
        task = await get_user_task(task_id, db, current_user)
        return TaskResponse.from_orm(task)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while retrieving the task"
        )

@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
) -> TaskResponse:
    """
    Create a new task.
    
    - **title**: Task title (required)
    - **description**: Task description (required)
    - **priority**: Task priority (optional, default: medium)
    - **due_date**: Task due date (optional)
    """
    try:
        # Validate due_date is not in the past
        if task_data.due_date and task_data.due_date < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Due date cannot be in the past"
            )
        
        # Create new task
        new_task = Task(
            id=str(uuid.uuid4()),
            title=task_data.title.strip(),
            description=task_data.description.strip(),
            priority=task_data.priority or "medium",
            due_date=task_data.due_date,
            status="pending",
            user_id=current_user["id"],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            is_deleted=False
        )
        
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        
        return TaskResponse.from_orm(new_task)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while creating the task"
        )

@router.put("/{task_id}", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def update_task(
    task_data: TaskUpdate,
    task_id: str = Path(..., description="Task ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
) -> TaskResponse:
    """
    Update an existing task.
    
    - **task_id**: UUID of the task to update
    - **title**: Updated task title (optional)
    - **description**: Updated task description (optional)
    - **priority**: Updated task priority (optional)
    - **due_date**: Updated task due date (optional)
    - **status**: Updated task status (optional)
    """
    try:
        task = await get_user_task(task_id, db, current_user)
        
        # Prevent updating completed tasks
        if task.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update completed tasks"
            )
        
        # Update fields if provided
        update_data = task_data.dict(exclude_unset=True)
        
        # Validate due_date if provided
        if "due_date" in update_data and update_data["due_date"]:
            if update_data["due_date"] < datetime.utcnow():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Due date cannot be in the past"
                )
        
        # Validate status transition
        if "status" in update_data:
            valid_statuses = ["pending", "in_progress", "completed"]
            if update_data["status"] not in valid_statuses:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Status must be one of: {', '.join(valid_statuses)}"
                )
        
        # Apply updates
        for field, value in update_data.items():
            if hasattr(task, field):
                if isinstance(value, str):
                    value = value.strip()
                setattr(task, field, value)
        
        task.updated_at = datetime.utcnow()
        
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

@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str = Path(..., description="Task ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
) -> None:
    """
    Soft delete a task.
    
    - **task_id**: UUID of the task to delete
    """
    try:
        task = await get_user_task(task_id, db, current_user)
        
        # Perform soft delete
        task.is_deleted = True
        task.updated_at = datetime.utcnow()
        
        db.commit()
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while deleting the task"
        )

@router.post("/{task_id}/complete", response_model=TaskResponse, status_code=status.HTTP_200_OK)
async def complete_task(
    task_id: str = Path(..., description="Task ID"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
) -> TaskResponse:
    """
    Mark a task as completed.
    
    - **task_id**: UUID of the task to complete
    """
    try:
        task = await get_user_task(task_id, db, current_user)
        
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
        
        return TaskResponse.from_orm(task)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while completing the task"
        )