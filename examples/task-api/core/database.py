"""
Core database module for async SQLAlchemy operations with SQLite.

This module provides database connection management, session handling, and base models
for a FastAPI application using async SQLAlchemy with SQLite backend.
"""

import os
import uuid
import logging
from datetime import datetime
from typing import AsyncGenerator, Optional
from contextlib import asynccontextmanager

import sqlalchemy as sa
from sqlalchemy import event, pool
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.sqlite import UUID as SQLiteUUID
from sqlalchemy.sql import func
from sqlalchemy.exc import SQLAlchemyError, DisconnectionError

# Configure logging
logger = logging.getLogger(__name__)


class DatabaseError(Exception):
    """Base exception for database operations."""
    pass


class ConnectionError(DatabaseError):
    """Raised when database connection fails."""
    pass


class SessionError(DatabaseError):
    """Raised when session operations fail."""
    pass


class Base(DeclarativeBase):
    """
    Base class for all database models.
    
    Provides common fields and functionality for all models including:
    - UUID primary key
    - Created and updated timestamps
    - Proper type annotations
    """
    
    # Use UUID as primary key for all models
    id: Mapped[str] = mapped_column(
        SQLiteUUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        nullable=False,
        index=True,
        doc="Unique identifier for the record"
    )
    
    # Timestamp fields with automatic management
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when record was created"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        doc="Timestamp when record was last updated"
    )

    def __repr__(self) -> str:
        """String representation of the model."""
        return f"<{self.__class__.__name__}(id={self.id})>"


class DatabaseManager:
    """
    Manages database connections, sessions, and lifecycle operations.
    
    This class encapsulates all database-related functionality including
    engine creation, session management, and cleanup operations.
    """
    
    def __init__(self, database_url: Optional[str] = None, echo: bool = False):
        """
        Initialize database manager.
        
        Args:
            database_url: Database connection URL. If None, uses environment variable
                         or defaults to SQLite file database.
            echo: Whether to echo SQL statements to logs.
        """
        self.database_url = self._get_database_url(database_url)
        self.echo = echo or os.getenv("DATABASE_ECHO", "false").lower() == "true"
        self.engine: Optional[AsyncEngine] = None
        self.session_factory: Optional[async_sessionmaker[AsyncSession]] = None
        
        logger.info(f"Database manager initialized with URL: {self._mask_url(self.database_url)}")
    
    def _get_database_url(self, url: Optional[str]) -> str:
        """
        Get database URL from parameter, environment, or default.
        
        Args:
            url: Explicit database URL
            
        Returns:
            Validated database URL
            
        Raises:
            DatabaseError: If URL format is invalid
        """
        if url:
            database_url = url
        else:
            database_url = os.getenv("DATABASE_URL", "sqlite:///./tasks.db")
        
        # Convert SQLite URL to async format if needed
        if database_url.startswith("sqlite:///"):
            database_url = database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        elif database_url.startswith("sqlite://"):
            database_url = database_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        
        # Validate URL format
        if not database_url.startswith("sqlite+aiosqlite://"):
            raise DatabaseError(f"Unsupported database URL format: {self._mask_url(database_url)}")
        
        return database_url
    
    def _mask_url(self, url: str) -> str:
        """Mask sensitive information in database URL for logging."""
        if "://" in url:
            scheme, rest = url.split("://", 1)
            if "@" in rest:
                credentials, host_part = rest.rsplit("@", 1)
                return f"{scheme}://***@{host_part}"
        return url
    
    async def initialize(self) -> None:
        """
        Initialize database engine and session factory.
        
        Raises:
            ConnectionError: If database connection cannot be established
        """
        try:
            # Create async engine with optimized settings for SQLite
            self.engine = create_async_engine(
                self.database_url,
                echo=self.echo,
                # SQLite-specific connection arguments
                connect_args={
                    "check_same_thread": False,  # Allow multiple threads
                    "timeout": 30,  # Connection timeout in seconds
                },
                # Connection pool settings
                poolclass=pool.StaticPool,  # Use static pool for SQLite
                pool_pre_ping=True,  # Verify connections before use
                pool_recycle=3600,  # Recycle connections every hour
                # Async-specific settings
                future=True,  # Use SQLAlchemy 2.0 style
            )
            
            # Configure SQLite-specific settings
            await self._configure_sqlite_settings()
            
            # Create session factory
            self.session_factory = async_sessionmaker(
                bind=self.engine,
                class_=AsyncSession,
                expire_on_commit=False,  # Keep objects accessible after commit
                autoflush=True,  # Auto-flush before queries
                autocommit=False,  # Manual transaction control
            )
            
            logger.info("Database engine and session factory initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise ConnectionError(f"Database initialization failed: {e}") from e
    
    async def _configure_sqlite_settings(self) -> None:
        """Configure SQLite-specific settings for optimal performance."""
        if not self.engine:
            return
        
        @event.listens_for(self.engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            """Set SQLite pragmas for better performance and reliability."""
            cursor = dbapi_connection.cursor()
            
            # Enable foreign key constraints
            cursor.execute("PRAGMA foreign_keys=ON")
            
            # Set WAL mode for better concurrency
            cursor.execute("PRAGMA journal_mode=WAL")
            
            # Set synchronous mode for balance of safety and performance
            cursor.execute("PRAGMA synchronous=NORMAL")
            
            # Set cache size (negative value = KB, positive = pages)
            cursor.execute("PRAGMA cache_size=-64000")  # 64MB cache
            
            # Set busy timeout for handling locks
            cursor.execute("PRAGMA busy_timeout=30000")  # 30 seconds
            
            cursor.close()
    
    async def create_tables(self) -> None:
        """
        Create all database tables defined in models.
        
        Raises:
            DatabaseError: If table creation fails
        """
        if not self.engine:
            raise DatabaseError("Database engine not initialized")
        
        try:
            async with self.engine.begin() as conn:
                # Create all tables defined in Base metadata
                await conn.run_sync(Base.metadata.create_all)
            
            logger.info("Database tables created successfully")
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to create database tables: {e}")
            raise DatabaseError(f"Table creation failed: {e}") from e
    
    async def drop_tables(self) -> None:
        """
        Drop all database tables. Use with caution!
        
        Raises:
            DatabaseError: If table dropping fails
        """
        if not self.engine:
            raise DatabaseError("Database engine not initialized")
        
        try:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
            
            logger.warning("All database tables dropped")
            
        except SQLAlchemyError as e:
            logger.error(f"Failed to drop database tables: {e}")
            raise DatabaseError(f"Table dropping failed: {e}") from e
    
    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Get database session with automatic cleanup.
        
        Yields:
            AsyncSession: Database session
            
        Raises:
            SessionError: If session creation or management fails
        """
        if not self.session_factory:
            raise SessionError("Session factory not initialized")
        
        session = self.session_factory()
        try:
            yield session
            await session.commit()
            
        except Exception as e:
            await session.rollback()
            logger.error(f"Session error, rolled back: {e}")
            raise SessionError(f"Session operation failed: {e}") from e
            
        finally:
            await session.close()
    
    async def close(self) -> None:
        """
        Close database engine and cleanup resources.
        
        Should be called during application shutdown.
        """
        if self.engine:
            try:
                await self.engine.dispose()
                logger.info("Database engine closed successfully")
            except Exception as e:
                logger.error(f"Error closing database engine: {e}")
            finally:
                self.engine = None
                self.session_factory = None


# Global database manager instance
db_manager = DatabaseManager()


async def init_db() -> None:
    """
    Initialize database connection and create tables.
    
    This function should be called during application startup.
    
    Raises:
        DatabaseError: If initialization fails
    """
    try:
        await db_manager.initialize()
        await db_manager.create_tables()
        logger.info("Database initialization completed")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise


async def close_db() -> None:
    """
    Close database connections and cleanup resources.
    
    This function should be called during application shutdown.
    """
    try:
        await db_manager.close()
        logger.info("Database cleanup completed")
        
    except Exception as e:
        logger.error(f"Database cleanup failed: {e}")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for getting database sessions.
    
    Yields:
        AsyncSession: Database session for request handling
        
    Raises:
        SessionError: If session cannot be created
        
    Example:
        ```python
        @app.get("/items/")
        async def get_items(db: AsyncSession = Depends(get_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()
        ```
    """
    async with db_manager.get_session() as session:
        try:
            yield session
        except DisconnectionError as e:
            logger.error(f"Database disconnection error: {e}")
            raise SessionError("Database connection lost") from e
        except SQLAlchemyError as e:
            logger.error(f"Database session error: {e}")
            raise SessionError(f"Database operation failed: {e}") from e


async def health_check() -> bool:
    """
    Check database connectivity and health.
    
    Returns:
        bool: True if database is healthy, False otherwise
    """
    try:
        async with db_manager.get_session() as session:
            # Simple query to test connectivity
            result = await session.execute(sa.text("SELECT 1"))
            return result.scalar() == 1
            
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False


# Export commonly used components
__all__ = [
    "Base",
    "DatabaseManager",
    "DatabaseError",
    "ConnectionError", 
    "SessionError",
    "init_db",
    "close_db",
    "get_db",
    "health_check",
    "db_manager",
]