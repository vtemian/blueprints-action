"""
Database connection and session management module for FastAPI application.

This module provides async database connectivity using SQLAlchemy 2.0+ with SQLite,
including proper session management, connection pooling, and error handling.
"""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator, Optional

from databases import Database
from sqlalchemy import (
    Column,
    DateTime,
    String,
    create_engine,
    event,
    pool,
)
from sqlalchemy.dialects.sqlite import UUID
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import StaticPool

# Configure logging
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tasks.db")
ASYNC_DATABASE_URL = DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://")

# Global database instances
database: Optional[Database] = None
async_engine: Optional[AsyncEngine] = None
async_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


class Base(DeclarativeBase):
    """SQLAlchemy declarative base class."""
    pass


class BaseModel(Base):
    """
    Abstract base model with common fields for all database models.
    
    Provides:
    - UUID primary key
    - Created and updated timestamps with automatic management
    - Proper SQLAlchemy 2.0 syntax with type annotations
    """
    __abstract__ = True
    
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        nullable=False,
        doc="Unique identifier for the record"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        doc="Timestamp when the record was created"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
        doc="Timestamp when the record was last updated"
    )
    
    def __repr__(self) -> str:
        """String representation of the model instance."""
        return f"<{self.__class__.__name__}(id={self.id})>"


def _configure_sqlite_connection(dbapi_connection, connection_record) -> None:
    """
    Configure SQLite connection settings for optimal performance and reliability.
    
    Args:
        dbapi_connection: The raw database connection
        connection_record: SQLAlchemy connection record
    """
    try:
        # Enable foreign key constraints
        dbapi_connection.execute("PRAGMA foreign_keys=ON")
        
        # Set WAL mode for better concurrency
        dbapi_connection.execute("PRAGMA journal_mode=WAL")
        
        # Set synchronous mode for better performance
        dbapi_connection.execute("PRAGMA synchronous=NORMAL")
        
        # Set cache size (negative value means KB)
        dbapi_connection.execute("PRAGMA cache_size=-64000")  # 64MB
        
        # Set temp store to memory
        dbapi_connection.execute("PRAGMA temp_store=MEMORY")
        
        # Set busy timeout
        dbapi_connection.execute("PRAGMA busy_timeout=30000")  # 30 seconds
        
        logger.debug("SQLite connection configured successfully")
        
    except Exception as e:
        logger.error(f"Failed to configure SQLite connection: {e}")
        raise


def _ensure_database_directory() -> None:
    """
    Ensure the database directory exists and has proper permissions.
    
    Raises:
        PermissionError: If unable to create directory or set permissions
        OSError: If directory creation fails
    """
    try:
        if DATABASE_URL.startswith("sqlite:///"):
            db_path = DATABASE_URL.replace("sqlite:///", "")
            if not db_path.startswith("/"):  # Relative path
                db_path = Path(db_path)
                db_dir = db_path.parent
                
                if not db_dir.exists():
                    db_dir.mkdir(parents=True, exist_ok=True)
                    logger.info(f"Created database directory: {db_dir}")
                
                # Ensure directory is writable
                if not os.access(db_dir, os.W_OK):
                    raise PermissionError(f"Database directory is not writable: {db_dir}")
                    
    except Exception as e:
        logger.error(f"Failed to ensure database directory: {e}")
        raise


def get_engine() -> AsyncEngine:
    """
    Get the configured async database engine.
    
    Returns:
        AsyncEngine: The configured SQLAlchemy async engine
        
    Raises:
        RuntimeError: If engine is not initialized
    """
    if async_engine is None:
        raise RuntimeError("Database engine not initialized. Call init_db() first.")
    return async_engine


def _create_async_engine() -> AsyncEngine:
    """
    Create and configure the async SQLAlchemy engine.
    
    Returns:
        AsyncEngine: Configured async database engine
        
    Raises:
        Exception: If engine creation fails
    """
    try:
        _ensure_database_directory()
        
        # Engine configuration for SQLite
        engine_kwargs = {
            "echo": os.getenv("DATABASE_ECHO", "false").lower() == "true",
            "future": True,
            "poolclass": StaticPool,
            "connect_args": {
                "check_same_thread": False,
                "timeout": 30,
            },
        }
        
        # Create async engine
        engine = create_async_engine(ASYNC_DATABASE_URL, **engine_kwargs)
        
        # Configure SQLite-specific settings for sync connections
        sync_engine = create_engine(DATABASE_URL, **engine_kwargs)
        event.listen(sync_engine, "connect", _configure_sqlite_connection)
        
        logger.info(f"Database engine created successfully: {ASYNC_DATABASE_URL}")
        return engine
        
    except Exception as e:
        logger.error(f"Failed to create database engine: {e}")
        raise


async def init_db() -> None:
    """
    Initialize the database connection and create all tables.
    
    This function should be called during application startup.
    
    Raises:
        Exception: If database initialization fails
    """
    global database, async_engine, async_session_factory
    
    try:
        logger.info("Initializing database...")
        
        # Create async engine
        async_engine = _create_async_engine()
        
        # Create session factory
        async_session_factory = async_sessionmaker(
            bind=async_engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=True,
            autocommit=False,
        )
        
        # Create database instance for raw queries if needed
        database = Database(ASYNC_DATABASE_URL)
        await database.connect()
        
        # Create all tables
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("Database initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        await close_db()  # Cleanup on failure
        raise


async def close_db() -> None:
    """
    Close database connections and cleanup resources.
    
    This function should be called during application shutdown.
    """
    global database, async_engine, async_session_factory
    
    try:
        logger.info("Closing database connections...")
        
        # Close database connection
        if database is not None:
            await database.disconnect()
            database = None
            
        # Dispose of async engine
        if async_engine is not None:
            await async_engine.dispose()
            async_engine = None
            
        # Clear session factory
        async_session_factory = None
        
        logger.info("Database connections closed successfully")
        
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database sessions with automatic cleanup.
    
    Yields:
        AsyncSession: Database session
        
    Raises:
        RuntimeError: If session factory is not initialized
        Exception: If session creation or cleanup fails
    """
    if async_session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    
    session = async_session_factory()
    try:
        logger.debug("Database session created")
        yield session
        await session.commit()
        logger.debug("Database session committed")
    except Exception as e:
        logger.error(f"Database session error: {e}")
        await session.rollback()
        raise
    finally:
        await session.close()
        logger.debug("Database session closed")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for database sessions.
    
    This function provides database sessions to FastAPI route handlers
    with automatic cleanup and error handling.
    
    Yields:
        AsyncSession: Database session for the request
        
    Example:
        @app.get("/items/")
        async def get_items(db: AsyncSession = Depends(get_db)):
            # Use db session here
            pass
    """
    async with get_db_session() as session:
        yield session


# Health check function
async def check_database_health() -> bool:
    """
    Check if the database connection is healthy.
    
    Returns:
        bool: True if database is accessible, False otherwise
    """
    try:
        if database is None:
            return False
            
        # Simple query to check connectivity
        await database.fetch_one("SELECT 1")
        return True
        
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False


# Utility function for raw queries
async def execute_raw_query(query: str, values: Optional[dict] = None) -> list:
    """
    Execute a raw SQL query.
    
    Args:
        query: SQL query string
        values: Optional query parameters
        
    Returns:
        list: Query results
        
    Raises:
        RuntimeError: If database is not initialized
        Exception: If query execution fails
    """
    if database is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    
    try:
        if values:
            result = await database.fetch_all(query, values)
        else:
            result = await database.fetch_all(query)
        return result
    except Exception as e:
        logger.error(f"Raw query execution failed: {e}")
        raise


# Export commonly used items
__all__ = [
    "Base",
    "BaseModel", 
    "init_db",
    "close_db",
    "get_db",
    "get_db_session",
    "get_engine",
    "check_database_health",
    "execute_raw_query",
    "DATABASE_URL",
    "ASYNC_DATABASE_URL",
]