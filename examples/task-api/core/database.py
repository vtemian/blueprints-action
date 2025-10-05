"""
Database connection and session management module for FastAPI application.

This module provides async database connectivity using SQLAlchemy with SQLite,
including session management, base model definitions, and FastAPI integration.
"""

import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator, Optional

from sqlalchemy import Column, DateTime, String, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_scoped_session,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import StaticPool
from sqlalchemy.sql import func

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./tasks.db")

# SQLAlchemy async engine configuration
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL query logging in development
    future=True,
    poolclass=StaticPool,
    connect_args={
        "check_same_thread": False,  # Required for SQLite
    } if "sqlite" in DATABASE_URL else {},
    pool_pre_ping=True,
    pool_recycle=300,
)

# Async session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=True,
    autocommit=False,
)

# Scoped session for thread-safe operations
AsyncScopedSession = async_scoped_session(
    async_session_factory,
    scopefunc=lambda: id(asyncio.current_task()) if 'asyncio' in globals() else None,
)

# Declarative base for ORM models
Base = declarative_base()


class BaseModel(Base):
    """
    Abstract base model with common fields for all database models.
    
    Provides:
    - UUID primary key
    - Created and updated timestamp fields
    - Automatic timestamp management
    """
    
    __abstract__ = True
    
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        nullable=False,
        index=True,
    )
    
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    
    def __repr__(self) -> str:
        """String representation of the model."""
        return f"<{self.__class__.__name__}(id={self.id})>"


# SQLAlchemy event listeners for automatic timestamp management
@event.listens_for(BaseModel, 'before_insert', propagate=True)
def set_created_at(mapper, connection, target):
    """Set created_at timestamp before insert."""
    now = datetime.utcnow()
    target.created_at = now
    target.updated_at = now


@event.listens_for(BaseModel, 'before_update', propagate=True)
def set_updated_at(mapper, connection, target):
    """Set updated_at timestamp before update."""
    target.updated_at = datetime.utcnow()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency function for database session management.
    
    Provides an async database session with proper cleanup.
    Use this as a dependency in FastAPI route handlers.
    
    Yields:
        AsyncSession: Database session instance
        
    Example:
        @app.get("/items/")
        async def read_items(db: AsyncSession = Depends(get_db)):
            # Use db session here
            pass
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database session management.
    
    Use this for manual session management outside of FastAPI dependencies.
    
    Yields:
        AsyncSession: Database session instance
        
    Example:
        async with get_db_session() as db:
            # Use db session here
            pass
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """
    Initialize the database and create all tables.
    
    This function should be called during application startup
    to ensure all database tables are created.
    
    Raises:
        Exception: If database initialization fails
    """
    try:
        async with engine.begin() as conn:
            # Import all models here to ensure they are registered with Base
            # This is where you would import your model modules
            # from app.models import user, task, etc.
            
            await conn.run_sync(Base.metadata.create_all)
            
    except Exception as e:
        raise Exception(f"Failed to initialize database: {str(e)}") from e


async def close_db() -> None:
    """
    Close database connections and perform cleanup.
    
    This function should be called during application shutdown
    to ensure proper cleanup of database resources.
    """
    try:
        # Remove scoped session
        await AsyncScopedSession.remove()
        
        # Dispose of the engine
        await engine.dispose()
        
    except Exception as e:
        # Log the error but don't raise it during shutdown
        print(f"Error during database cleanup: {str(e)}")


async def check_db_connection() -> bool:
    """
    Check if database connection is healthy.
    
    Returns:
        bool: True if connection is healthy, False otherwise
    """
    try:
        async with async_session_factory() as session:
            await session.execute("SELECT 1")
            return True
    except Exception:
        return False


def get_database_url() -> str:
    """
    Get the current database URL.
    
    Returns:
        str: Database URL being used
    """
    return DATABASE_URL


# FastAPI lifespan event handlers (for FastAPI 0.93+)
async def startup_event() -> None:
    """Application startup event handler."""
    await init_db()


async def shutdown_event() -> None:
    """Application shutdown event handler."""
    await close_db()


# Export commonly used items
__all__ = [
    "Base",
    "BaseModel",
    "engine",
    "async_session_factory",
    "AsyncScopedSession",
    "get_db",
    "get_db_session",
    "init_db",
    "close_db",
    "check_db_connection",
    "get_database_url",
    "startup_event",
    "shutdown_event",
]