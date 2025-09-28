"""
Core database module for async SQLAlchemy operations with FastAPI integration.

This module provides database connection management, session handling, and base models
for the application using SQLAlchemy with async support.
"""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator, Optional, Any
from urllib.parse import urlparse

import sqlalchemy as sa
from sqlalchemy import event, pool
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    AsyncEngine,
    create_async_engine,
    async_sessionmaker,
    async_scoped_session
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.exc import SQLAlchemyError, DisconnectionError
from databases import Database
from fastapi import HTTPException
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./tasks.db")
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///./test_tasks.db")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Connection pool settings
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "5"))
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "10"))
POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "3600"))


class DatabaseError(Exception):
    """Base exception for database operations."""
    pass


class ConnectionError(DatabaseError):
    """Exception raised when database connection fails."""
    pass


class SessionError(DatabaseError):
    """Exception raised during session operations."""
    pass


class GUID(TypeDecorator):
    """
    Platform-independent GUID type.
    Uses PostgreSQL's UUID type when available, otherwise uses CHAR(36).
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
    """Base class for all database models."""
    pass


class BaseModel(Base):
    """
    Abstract base model with common fields for all database tables.
    
    Provides:
    - UUID primary key
    - Automatic timestamp management
    - Common query methods
    """
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
        doc="Unique identifier for the record"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        nullable=False,
        doc="Timestamp when the record was created"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
        nullable=False,
        doc="Timestamp when the record was last updated"
    )

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(id={self.id})>"


class DatabaseManager:
    """
    Manages database connections, sessions, and lifecycle operations.
    
    Handles:
    - Async engine creation and configuration
    - Session factory management
    - Connection pool monitoring
    - Graceful shutdown procedures
    """
    
    def __init__(self, database_url: str = DATABASE_URL):
        self.database_url = self._validate_database_url(database_url)
        self.engine: Optional[AsyncEngine] = None
        self.async_session_factory: Optional[async_sessionmaker] = None
        self.database: Optional[Database] = None
        self._is_initialized = False
        
    def _validate_database_url(self, url: str) -> str:
        """
        Validate and normalize database URL.
        
        Args:
            url: Database URL to validate
            
        Returns:
            Validated database URL
            
        Raises:
            ValueError: If URL is invalid
        """
        try:
            parsed = urlparse(url)
            if not parsed.scheme:
                raise ValueError("Database URL must include a scheme")
            
            # Convert SQLite URLs to async format
            if parsed.scheme == "sqlite":
                url = url.replace("sqlite://", "sqlite+aiosqlite://")
            elif parsed.scheme == "postgresql":
                url = url.replace("postgresql://", "postgresql+asyncpg://")
                
            logger.info(f"Database URL validated: {parsed.scheme}://{parsed.netloc}{parsed.path}")
            return url
            
        except Exception as e:
            raise ValueError(f"Invalid database URL: {e}")

    def _get_engine_kwargs(self) -> dict[str, Any]:
        """
        Get engine configuration based on database type.
        
        Returns:
            Dictionary of engine configuration parameters
        """
        base_kwargs = {
            "echo": ENVIRONMENT == "development",
            "future": True,  # Use SQLAlchemy 2.0 style
        }
        
        # SQLite-specific configuration
        if "sqlite" in self.database_url:
            base_kwargs.update({
                "poolclass": pool.StaticPool,
                "connect_args": {
                    "check_same_thread": False,
                    "timeout": 20,
                },
            })
        else:
            # PostgreSQL and other databases
            base_kwargs.update({
                "pool_size": POOL_SIZE,
                "max_overflow": MAX_OVERFLOW,
                "pool_timeout": POOL_TIMEOUT,
                "pool_recycle": POOL_RECYCLE,
                "pool_pre_ping": True,  # Validate connections before use
            })
            
        return base_kwargs

    async def initialize(self) -> None:
        """
        Initialize database engine and session factory.
        
        Raises:
            ConnectionError: If database connection fails
        """
        if self._is_initialized:
            logger.warning("Database manager already initialized")
            return
            
        try:
            # Create async engine
            engine_kwargs = self._get_engine_kwargs()
            self.engine = create_async_engine(self.database_url, **engine_kwargs)
            
            # Set up event listeners for connection monitoring
            self._setup_event_listeners()
            
            # Create session factory with proper configuration
            self.async_session_factory = async_sessionmaker(
                bind=self.engine,
                class_=AsyncSession,
                expire_on_commit=False,  # Keep objects accessible after commit
                autoflush=True,
                autocommit=False,
            )
            
            # Initialize databases library for additional async support
            self.database = Database(self.database_url)
            await self.database.connect()
            
            # Test connection
            await self._test_connection()
            
            self._is_initialized = True
            logger.info("Database manager initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            await self.cleanup()
            raise ConnectionError(f"Database initialization failed: {e}")

    def _setup_event_listeners(self) -> None:
        """Set up SQLAlchemy event listeners for monitoring."""
        if not self.engine:
            return
            
        @event.listens_for(self.engine.sync_engine, "connect")
        def on_connect(dbapi_connection, connection_record):
            logger.debug("Database connection established")
            
        @event.listens_for(self.engine.sync_engine, "disconnect")
        def on_disconnect(dbapi_connection, connection_record):
            logger.debug("Database connection closed")
            
        @event.listens_for(self.engine.sync_engine, "handle_error")
        def on_error(exception_context):
            logger.error(f"Database error: {exception_context.original_exception}")

    async def _test_connection(self) -> None:
        """
        Test database connection.
        
        Raises:
            ConnectionError: If connection test fails
        """
        try:
            async with self.get_session() as session:
                await session.execute(sa.text("SELECT 1"))
                logger.info("Database connection test successful")
        except Exception as e:
            raise ConnectionError(f"Database connection test failed: {e}")

    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Get database session with automatic cleanup.
        
        Yields:
            AsyncSession: Database session
            
        Raises:
            SessionError: If session creation fails
        """
        if not self._is_initialized or not self.async_session_factory:
            raise SessionError("Database manager not initialized")
            
        session = self.async_session_factory()
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Session error, rolling back: {e}")
            raise SessionError(f"Database session error: {e}")
        finally:
            await session.close()

    async def create_tables(self) -> None:
        """
        Create all database tables.
        
        Raises:
            DatabaseError: If table creation fails
        """
        if not self.engine:
            raise DatabaseError("Database engine not initialized")
            
        try:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables created successfully")
        except Exception as e:
            logger.error(f"Failed to create tables: {e}")
            raise DatabaseError(f"Table creation failed: {e}")

    async def drop_tables(self) -> None:
        """
        Drop all database tables.
        
        Raises:
            DatabaseError: If table dropping fails
        """
        if not self.engine:
            raise DatabaseError("Database engine not initialized")
            
        try:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
            logger.info("Database tables dropped successfully")
        except Exception as e:
            logger.error(f"Failed to drop tables: {e}")
            raise DatabaseError(f"Table dropping failed: {e}")

    async def cleanup(self) -> None:
        """Clean up database connections and resources."""
        try:
            if self.database:
                await self.database.disconnect()
                self.database = None
                
            if self.engine:
                await self.engine.dispose()
                self.engine = None
                
            self.async_session_factory = None
            self._is_initialized = False
            logger.info("Database cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during database cleanup: {e}")

    async def health_check(self) -> dict[str, Any]:
        """
        Perform database health check.
        
        Returns:
            Dictionary with health check results
        """
        try:
            start_time = datetime.now()
            async with self.get_session() as session:
                await session.execute(sa.text("SELECT 1"))
            response_time = (datetime.now() - start_time).total_seconds()
            
            return {
                "status": "healthy",
                "response_time": response_time,
                "database_url": self.database_url.split("@")[-1] if "@" in self.database_url else self.database_url,
                "initialized": self._is_initialized,
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "database_url": self.database_url.split("@")[-1] if "@" in self.database_url else self.database_url,
                "initialized": self._is_initialized,
            }


# Global database manager instance
db_manager = DatabaseManager()


async def init_db() -> None:
    """
    Initialize database connection and create tables.
    
    This function should be called during application startup.
    
    Raises:
        ConnectionError: If database initialization fails
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
    Close database connections and clean up resources.
    
    This function should be called during application shutdown.
    """
    await db_manager.cleanup()
    logger.info("Database connections closed")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency for getting database session.
    
    Yields:
        AsyncSession: Database session for request handling
        
    Raises:
        HTTPException: If database session cannot be created
        
    Usage:
        @app.get("/items/")
        async def read_items(db: AsyncSession = Depends(get_db)):
            # Use db session here
            pass
    """
    try:
        async with db_manager.get_session() as session:
            yield session
    except SessionError as e:
        logger.error(f"Failed to get database session: {e}")
        raise HTTPException(
            status_code=500,
            detail="Database connection error"
        )
    except Exception as e:
        logger.error(f"Unexpected error getting database session: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


async def get_db_health() -> dict[str, Any]:
    """
    Get database health status.
    
    Returns:
        Dictionary with health check results
    """
    return await db_manager.health_check()


# Context manager for database operations outside of FastAPI
@asynccontextmanager
async def database_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database operations outside of FastAPI dependency injection.
    
    Yields:
        AsyncSession: Database session
        
    Usage:
        async with database_session() as db:
            result = await db.execute(select(User))
            users = result.scalars().all()
    """
    async with db_manager.get_session() as session:
        yield session


# Utility functions for common database operations
async def execute_query(query: str, params: Optional[dict] = None) -> Any:
    """
    Execute raw SQL query with parameters.
    
    Args:
        query: SQL query string
        params: Query parameters
        
    Returns:
        Query result
        
    Raises:
        DatabaseError: If query execution fails
    """
    try:
        async with database_session() as session:
            result = await session.execute(sa.text(query), params or {})
            return result
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        raise DatabaseError(f"Query execution failed: {e}")