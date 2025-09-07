"""
Database connection and session management module for async SQLAlchemy operations.

This module provides:
- Async database engine configuration
- Base model class with UUID primary keys and timestamps
- FastAPI dependency injection for database sessions
- Proper connection pooling and session management
"""

import os
import uuid
from datetime import datetime
from typing import AsyncGenerator, Optional

from sqlalchemy import String, DateTime, func, event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
    AsyncEngine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.types import TypeDecorator, CHAR
import logging

# Configure logging
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./tasks.db")

# Global variables for engine and session factory
engine: Optional[AsyncEngine] = None
async_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


class GUID(TypeDecorator):
    """
    Platform-independent GUID type.
    Uses PostgreSQL's UUID type when available, otherwise uses CHAR(36) for SQLite.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(UUID())
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == 'postgresql':
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return str(uuid.UUID(value))
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
            return value


class Base(DeclarativeBase):
    """
    Base class for all database models.
    
    Provides:
    - UUID primary key
    - Created and updated timestamp fields
    - Automatic timestamp management
    """
    
    id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )


def create_database_engine() -> AsyncEngine:
    """
    Create and configure the async database engine.
    
    Returns:
        AsyncEngine: Configured SQLAlchemy async engine
        
    Raises:
        ValueError: If DATABASE_URL is invalid
        Exception: If engine creation fails
    """
    try:
        # Engine configuration based on database type
        if "sqlite" in DATABASE_URL:
            # SQLite-specific configuration
            engine_kwargs = {
                "echo": os.getenv("DB_ECHO", "false").lower() == "true",
                "pool_pre_ping": True,
                "pool_recycle": 300,
                "connect_args": {
                    "check_same_thread": False,
                    "timeout": 20,
                }
            }
        else:
            # PostgreSQL or other database configuration
            engine_kwargs = {
                "echo": os.getenv("DB_ECHO", "false").lower() == "true",
                "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
                "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "10")),
                "pool_pre_ping": True,
                "pool_recycle": 3600,
            }
        
        async_engine = create_async_engine(DATABASE_URL, **engine_kwargs)
        logger.info(f"Database engine created successfully for: {DATABASE_URL.split('://')[0]}")
        return async_engine
        
    except Exception as e:
        logger.error(f"Failed to create database engine: {e}")
        raise


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """
    Create async session factory.
    
    Args:
        engine: SQLAlchemy async engine
        
    Returns:
        async_sessionmaker: Configured session factory
    """
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=True,
        autocommit=False,
    )


async def init_db() -> None:
    """
    Initialize database by creating all tables.
    
    This function should be called during application startup.
    
    Raises:
        Exception: If table creation fails
    """
    global engine, async_session_factory
    
    try:
        # Create engine if not exists
        if engine is None:
            engine = create_database_engine()
        
        # Create session factory if not exists
        if async_session_factory is None:
            async_session_factory = create_session_factory(engine)
        
        # Create all tables
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("Database tables created successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


async def close_db() -> None:
    """
    Close database connections and cleanup resources.
    
    This function should be called during application shutdown.
    """
    global engine, async_session_factory
    
    try:
        if engine:
            await engine.dispose()
            logger.info("Database connections closed successfully")
        
        engine = None
        async_session_factory = None
        
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")
        raise


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for getting database session.
    
    Provides async database session with proper cleanup and error handling.
    
    Yields:
        AsyncSession: Database session for use in FastAPI endpoints
        
    Raises:
        Exception: If session creation or database operation fails
    """
    global async_session_factory
    
    # Ensure database is initialized
    if async_session_factory is None:
        await init_db()
    
    # Create session
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


async def get_db_session() -> AsyncSession:
    """
    Get a database session for use outside of FastAPI dependency injection.
    
    Note: Remember to properly close the session after use.
    
    Returns:
        AsyncSession: Database session
        
    Raises:
        RuntimeError: If database is not initialized
    """
    global async_session_factory
    
    if async_session_factory is None:
        await init_db()
    
    if async_session_factory is None:
        raise RuntimeError("Database not properly initialized")
    
    return async_session_factory()


# Event listeners for automatic timestamp updates
@event.listens_for(Base, 'before_update', propagate=True)
def receive_before_update(mapper, connection, target):
    """Update the updated_at timestamp before any update operation."""
    target.updated_at = datetime.utcnow()


# Health check function
async def check_database_health() -> bool:
    """
    Check if database connection is healthy.
    
    Returns:
        bool: True if database is accessible, False otherwise
    """
    try:
        async with get_db_session() as session:
            await session.execute(func.now())
            return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False


# Export public interface
__all__ = [
    "Base",
    "get_db",
    "get_db_session", 
    "init_db",
    "close_db",
    "check_database_health",
    "GUID",
]