"""
Database connection and session management module.

This module provides async database connectivity using SQLAlchemy 2.x with SQLite
for development and production environments. Includes proper connection pooling,
session management, and FastAPI dependency injection patterns.
"""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator, Optional

from sqlalchemy import DateTime, String, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import StaticPool
from sqlalchemy.sql import func

# Configure logging
logger = logging.getLogger(__name__)

# Environment configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "sqlite+aiosqlite:///./tasks.db"
)

# Validate DATABASE_URL format
if not DATABASE_URL or not isinstance(DATABASE_URL, str):
    raise ValueError("DATABASE_URL must be a valid string")

if not any(DATABASE_URL.startswith(prefix) for prefix in ["sqlite+aiosqlite://", "postgresql+asyncpg://", "mysql+aiomysql://"]):
    logger.warning(f"DATABASE_URL format may not be supported: {DATABASE_URL}")


class Base(DeclarativeBase):
    """
    Declarative base class for all database models.
    
    Provides common functionality and type mapping for SQLAlchemy 2.x models.
    """
    pass


class BaseModel(Base):
    """
    Abstract base model with common fields for all database entities.
    
    Provides:
    - UUID primary key
    - Automatic timestamp management (created_at, updated_at)
    - Proper SQLAlchemy 2.x type annotations
    """
    __abstract__ = True
    
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid.uuid4()),
        doc="UUID primary key"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when record was created"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        doc="Timestamp when record was last updated"
    )


# Database engine configuration
def create_database_engine() -> AsyncEngine:
    """
    Create and configure async database engine with proper connection pooling.
    
    Returns:
        AsyncEngine: Configured SQLAlchemy async engine
        
    Raises:
        ValueError: If DATABASE_URL is invalid
        Exception: If engine creation fails
    """
    try:
        # Engine configuration based on database type
        if DATABASE_URL.startswith("sqlite+aiosqlite://"):
            # SQLite-specific configuration
            engine = create_async_engine(
                DATABASE_URL,
                echo=os.getenv("DB_ECHO", "false").lower() == "true",
                poolclass=StaticPool,
                connect_args={
                    "check_same_thread": False,
                    "timeout": 30,
                },
                pool_pre_ping=True,
                pool_recycle=3600,  # 1 hour
            )
        else:
            # PostgreSQL/MySQL configuration
            engine = create_async_engine(
                DATABASE_URL,
                echo=os.getenv("DB_ECHO", "false").lower() == "true",
                pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
                max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "20")),
                pool_pre_ping=True,
                pool_recycle=3600,  # 1 hour
                connect_args={
                    "server_settings": {
                        "application_name": "FastAPI_App",
                    }
                } if "postgresql" in DATABASE_URL else {}
            )
        
        logger.info(f"Database engine created successfully for: {DATABASE_URL.split('://')[0]}")
        return engine
        
    except Exception as e:
        logger.error(f"Failed to create database engine: {str(e)}")
        raise


# Create global engine instance
engine: AsyncEngine = create_database_engine()

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=True,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for database session management.
    
    Provides async database session with proper cleanup and error handling.
    Use this as a dependency in FastAPI route handlers.
    
    Yields:
        AsyncSession: Database session for the request
        
    Example:
        @app.get("/items/")
        async def get_items(db: AsyncSession = Depends(get_db)):
            # Use db session here
            pass
    """
    session: Optional[AsyncSession] = None
    
    try:
        session = AsyncSessionLocal()
        logger.debug("Database session created")
        yield session
        
    except Exception as e:
        logger.error(f"Database session error: {str(e)}")
        if session:
            await session.rollback()
            logger.debug("Database session rolled back due to error")
        raise
        
    finally:
        if session:
            try:
                await session.close()
                logger.debug("Database session closed")
            except Exception as e:
                logger.error(f"Error closing database session: {str(e)}")


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database sessions outside of FastAPI dependencies.
    
    Use this for background tasks, CLI operations, or other non-request contexts.
    
    Yields:
        AsyncSession: Database session with automatic cleanup
        
    Example:
        async with get_db_context() as db:
            # Use db session here
            result = await db.execute(select(User))
    """
    session: Optional[AsyncSession] = None
    
    try:
        session = AsyncSessionLocal()
        logger.debug("Database context session created")
        yield session
        await session.commit()
        
    except Exception as e:
        logger.error(f"Database context session error: {str(e)}")
        if session:
            await session.rollback()
        raise
        
    finally:
        if session:
            try:
                await session.close()
                logger.debug("Database context session closed")
            except Exception as e:
                logger.error(f"Error closing database context session: {str(e)}")


async def init_db(max_retries: int = 3, retry_delay: float = 1.0) -> None:
    """
    Initialize database by creating all tables.
    
    Includes retry logic for handling temporary connection issues.
    
    Args:
        max_retries: Maximum number of retry attempts
        retry_delay: Delay between retry attempts in seconds
        
    Raises:
        Exception: If database initialization fails after all retries
    """
    import asyncio
    
    for attempt in range(max_retries + 1):
        try:
            async with engine.begin() as conn:
                # Import all models to ensure they're registered
                # This should be done before creating tables
                logger.info("Creating database tables...")
                await conn.run_sync(Base.metadata.create_all)
                logger.info("Database tables created successfully")
                return
                
        except Exception as e:
            if attempt < max_retries:
                logger.warning(
                    f"Database initialization attempt {attempt + 1} failed: {str(e)}. "
                    f"Retrying in {retry_delay} seconds..."
                )
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                logger.error(f"Database initialization failed after {max_retries + 1} attempts: {str(e)}")
                raise


async def close_db() -> None:
    """
    Gracefully close database connections and cleanup resources.
    
    Should be called during application shutdown to ensure proper cleanup.
    """
    try:
        await engine.dispose()
        logger.info("Database connections closed successfully")
        
    except Exception as e:
        logger.error(f"Error closing database connections: {str(e)}")
        raise


async def health_check() -> bool:
    """
    Perform database health check.
    
    Returns:
        bool: True if database is accessible, False otherwise
    """
    try:
        async with get_db_context() as db:
            # Simple query to test connection
            await db.execute(func.now())
            logger.debug("Database health check passed")
            return True
            
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return False


# Event listeners for automatic timestamp updates
@event.listens_for(BaseModel, 'before_update', propagate=True)
def receive_before_update(mapper, connection, target):
    """Update the updated_at timestamp before any update operation."""
    target.updated_at = datetime.utcnow()


# Export commonly used components
__all__ = [
    "Base",
    "BaseModel", 
    "engine",
    "AsyncSessionLocal",
    "get_db",
    "get_db_context",
    "init_db",
    "close_db",
    "health_check",
]