"""
Database connection and session management module for FastAPI application.
Provides async SQLAlchemy setup with UUID-based models and proper session management.
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
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import StaticPool
from sqlalchemy.sql import func

# Configure logging
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./tasks.db")
ECHO_SQL = os.getenv("ECHO_SQL", "false").lower() == "true"

# Global database engine and session factory
engine: Optional[AsyncEngine] = None
async_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


class Base(DeclarativeBase):
    """
    Abstract base class for all database models.
    Provides UUID primary key and timestamp fields.
    """
    
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        unique=True,
        nullable=False,
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

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id={self.id})>"


def create_database_engine() -> AsyncEngine:
    """
    Create and configure the async database engine with connection pooling.
    
    Returns:
        AsyncEngine: Configured SQLAlchemy async engine
        
    Raises:
        ValueError: If database URL is invalid
    """
    try:
        # SQLite-specific configuration for development
        if DATABASE_URL.startswith("sqlite"):
            engine = create_async_engine(
                DATABASE_URL,
                echo=ECHO_SQL,
                poolclass=StaticPool,
                connect_args={
                    "check_same_thread": False,
                    "timeout": 30,
                },
                pool_pre_ping=True,
                pool_recycle=3600,  # 1 hour
            )
        else:
            # PostgreSQL or other database configuration
            engine = create_async_engine(
                DATABASE_URL,
                echo=ECHO_SQL,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
                pool_recycle=3600,  # 1 hour
                connect_args={
                    "server_settings": {
                        "application_name": "fastapi_tasks_app",
                    }
                } if "postgresql" in DATABASE_URL else {}
            )
        
        logger.info(f"Database engine created successfully for: {DATABASE_URL.split('://')[0]}")
        return engine
        
    except Exception as e:
        logger.error(f"Failed to create database engine: {e}")
        raise ValueError(f"Invalid database configuration: {e}") from e


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """
    Create async session factory with proper configuration.
    
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
    Initialize database tables and setup global engine and session factory.
    Should be called during application startup.
    
    Raises:
        Exception: If database initialization fails
    """
    global engine, async_session_factory
    
    try:
        # Create engine and session factory
        engine = create_database_engine()
        async_session_factory = create_session_factory(engine)
        
        # Create all tables
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
        logger.info("Database initialized successfully")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise


async def close_db() -> None:
    """
    Close database connections and cleanup resources.
    Should be called during application shutdown.
    """
    global engine, async_session_factory
    
    try:
        if engine:
            await engine.dispose()
            logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")
    finally:
        engine = None
        async_session_factory = None


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager for database sessions with proper cleanup.
    
    Yields:
        AsyncSession: Database session
        
    Raises:
        RuntimeError: If database is not initialized
        Exception: If session creation fails
    """
    if not async_session_factory:
        raise RuntimeError(
            "Database not initialized. Call init_db() during application startup."
        )
    
    session = async_session_factory()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Database session error: {e}")
        raise
    finally:
        await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for database sessions.
    Provides automatic session management with proper cleanup.
    
    Yields:
        AsyncSession: Database session for request handling
        
    Usage:
        @app.get("/items/")
        async def get_items(db: AsyncSession = Depends(get_db)):
            # Use db session here
            pass
    """
    async with get_db_session() as session:
        yield session


# Event listeners for SQLite to enable foreign key constraints
@event.listens_for(engine, "connect", once=True)
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign key constraints for SQLite connections."""
    if "sqlite" in DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# Health check function
async def check_db_health() -> bool:
    """
    Check database connectivity for health checks.
    
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


# Database utilities
async def get_db_info() -> dict:
    """
    Get database information for debugging and monitoring.
    
    Returns:
        dict: Database connection information
    """
    if not engine:
        return {"status": "not_initialized"}
    
    return {
        "status": "initialized",
        "url": DATABASE_URL.split("://")[0] + "://***",  # Hide credentials
        "pool_size": getattr(engine.pool, "size", "N/A"),
        "checked_out": getattr(engine.pool, "checkedout", "N/A"),
        "overflow": getattr(engine.pool, "overflow", "N/A"),
        "echo": engine.echo,
    }