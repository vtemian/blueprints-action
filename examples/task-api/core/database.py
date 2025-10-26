"""
Database connection and session management module.

This module provides a robust async database connection system using SQLAlchemy
with SQLite, including proper connection pooling, session management, and
comprehensive error handling.
"""

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, Optional, Type, TypeVar
from urllib.parse import quote_plus

from databases import Database
from sqlalchemy import (
    Column,
    DateTime,
    String,
    create_engine,
    event,
    pool,
    text,
)
from sqlalchemy.dialects.sqlite import UUID as SQLiteUUID
from sqlalchemy.engine import Engine
from sqlalchemy.exc import (
    DatabaseError,
    DisconnectionError,
    OperationalError,
    SQLAlchemyError,
)
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

# Type variables
ModelType = TypeVar("ModelType", bound="BaseModel")


class DatabaseConfig:
    """Database configuration with environment variable support."""
    
    def __init__(self) -> None:
        """Initialize database configuration from environment variables."""
        self.database_url: str = os.getenv(
            "DATABASE_URL", 
            "sqlite+aiosqlite:///./app.db"
        )
        self.database_url_sync: str = os.getenv(
            "DATABASE_URL_SYNC",
            "sqlite:///./app.db"
        )
        self.echo: bool = os.getenv("DATABASE_ECHO", "false").lower() == "true"
        self.pool_size: int = int(os.getenv("DATABASE_POOL_SIZE", "10"))
        self.max_overflow: int = int(os.getenv("DATABASE_MAX_OVERFLOW", "20"))
        self.pool_timeout: int = int(os.getenv("DATABASE_POOL_TIMEOUT", "30"))
        self.pool_recycle: int = int(os.getenv("DATABASE_POOL_RECYCLE", "3600"))
        self.retry_attempts: int = int(os.getenv("DATABASE_RETRY_ATTEMPTS", "3"))
        self.retry_delay: float = float(os.getenv("DATABASE_RETRY_DELAY", "1.0"))
        self.connection_timeout: int = int(os.getenv("DATABASE_CONNECTION_TIMEOUT", "30"))
        
    def get_async_url(self) -> str:
        """Get the async database URL."""
        return self.database_url
    
    def get_sync_url(self) -> str:
        """Get the sync database URL."""
        return self.database_url_sync
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            "database_url": self.database_url,
            "database_url_sync": self.database_url_sync,
            "echo": self.echo,
            "pool_size": self.pool_size,
            "max_overflow": self.max_overflow,
            "pool_timeout": self.pool_timeout,
            "pool_recycle": self.pool_recycle,
            "retry_attempts": self.retry_attempts,
            "retry_delay": self.retry_delay,
            "connection_timeout": self.connection_timeout,
        }


class DatabaseError(Exception):
    """Base exception for database operations."""
    pass


class ConnectionError(DatabaseError):
    """Exception raised when database connection fails."""
    pass


class SessionError(DatabaseError):
    """Exception raised during session operations."""
    pass


class BaseModel(DeclarativeBase):
    """Base model with common fields for all database models."""
    
    id: Mapped[str] = mapped_column(
        SQLiteUUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        doc="Unique identifier for the record"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        doc="Timestamp when the record was created"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        doc="Timestamp when the record was last updated"
    )
    
    def __repr__(self) -> str:
        """String representation of the model."""
        return f"<{self.__class__.__name__}(id={self.id})>"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert model instance to dictionary."""
        return {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
        }


class DatabaseManager:
    """Database manager for handling connections and sessions."""
    
    def __init__(self, config: Optional[DatabaseConfig] = None) -> None:
        """
        Initialize database manager.
        
        Args:
            config: Database configuration instance
        """
        self.config = config or DatabaseConfig()
        self._async_engine: Optional[AsyncEngine] = None
        self._sync_engine: Optional[Engine] = None
        self._async_session_factory: Optional[async_sessionmaker[AsyncSession]] = None
        self._database: Optional[Database] = None
        self._is_initialized = False
        
        logger.info("DatabaseManager initialized with config: %s", self.config.to_dict())
    
    @property
    def async_engine(self) -> AsyncEngine:
        """Get or create async engine."""
        if self._async_engine is None:
            self._async_engine = self._create_async_engine()
        return self._async_engine
    
    @property
    def sync_engine(self) -> Engine:
        """Get or create sync engine."""
        if self._sync_engine is None:
            self._sync_engine = self._create_sync_engine()
        return self._sync_engine
    
    @property
    def session_factory(self) -> async_sessionmaker[AsyncSession]:
        """Get or create async session factory."""
        if self._async_session_factory is None:
            self._async_session_factory = async_sessionmaker(
                bind=self.async_engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=True,
                autocommit=False,
            )
        return self._async_session_factory
    
    def _create_async_engine(self) -> AsyncEngine:
        """Create async SQLAlchemy engine with proper configuration."""
        try:
            # SQLite-specific configuration
            if "sqlite" in self.config.get_async_url():
                engine = create_async_engine(
                    self.config.get_async_url(),
                    echo=self.config.echo,
                    poolclass=StaticPool,
                    connect_args={
                        "check_same_thread": False,
                        "timeout": self.config.connection_timeout,
                    },
                    pool_pre_ping=True,
                    pool_recycle=self.config.pool_recycle,
                )
            else:
                # PostgreSQL/MySQL configuration
                engine = create_async_engine(
                    self.config.get_async_url(),
                    echo=self.config.echo,
                    pool_size=self.config.pool_size,
                    max_overflow=self.config.max_overflow,
                    pool_timeout=self.config.pool_timeout,
                    pool_recycle=self.config.pool_recycle,
                    pool_pre_ping=True,
                )
            
            # Add event listeners
            self._setup_engine_events(engine.sync_engine)
            
            logger.info("Async engine created successfully")
            return engine
            
        except Exception as e:
            logger.error("Failed to create async engine: %s", str(e))
            raise ConnectionError(f"Failed to create async engine: {str(e)}") from e
    
    def _create_sync_engine(self) -> Engine:
        """Create sync SQLAlchemy engine with proper configuration."""
        try:
            # SQLite-specific configuration
            if "sqlite" in self.config.get_sync_url():
                engine = create_engine(
                    self.config.get_sync_url(),
                    echo=self.config.echo,
                    poolclass=StaticPool,
                    connect_args={
                        "check_same_thread": False,
                        "timeout": self.config.connection_timeout,
                    },
                    pool_pre_ping=True,
                    pool_recycle=self.config.pool_recycle,
                )
            else:
                # PostgreSQL/MySQL configuration
                engine = create_engine(
                    self.config.get_sync_url(),
                    echo=self.config.echo,
                    pool_size=self.config.pool_size,
                    max_overflow=self.config.max_overflow,
                    pool_timeout=self.config.pool_timeout,
                    pool_recycle=self.config.pool_recycle,
                    pool_pre_ping=True,
                )
            
            # Add event listeners
            self._setup_engine_events(engine)
            
            logger.info("Sync engine created successfully")
            return engine
            
        except Exception as e:
            logger.error("Failed to create sync engine: %s", str(e))
            raise ConnectionError(f"Failed to create sync engine: {str(e)}") from e
    
    def _setup_engine_events(self, engine: Engine) -> None:
        """Setup engine event listeners."""
        
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            """Set SQLite pragmas for better performance and reliability."""
            if "sqlite" in str(engine.url):
                cursor = dbapi_connection.cursor()
                # Enable foreign key constraints
                cursor.execute("PRAGMA foreign_keys=ON")
                # Set journal mode to WAL for better concurrency
                cursor.execute("PRAGMA journal_mode=WAL")
                # Set synchronous mode to NORMAL for better performance
                cursor.execute("PRAGMA synchronous=NORMAL")
                # Set cache size (negative value means KB)
                cursor.execute("PRAGMA cache_size=-64000")  # 64MB
                # Set temp store to memory
                cursor.execute("PRAGMA temp_store=MEMORY")
                cursor.close()
        
        @event.listens_for(engine, "engine_connect")
        def receive_engine_connect(conn, branch):
            """Log engine connections."""
            logger.debug("Database engine connected")
        
        @event.listens_for(engine, "engine_disposed")
        def receive_engine_disposed(engine):
            """Log engine disposal."""
            logger.info("Database engine disposed")
    
    async def initialize(self) -> None:
        """Initialize database connections and create tables."""
        if self._is_initialized:
            logger.warning("Database already initialized")
            return
        
        try:
            # Test async connection
            await self._test_async_connection()
            
            # Create database instance for raw queries
            self._database = Database(self.config.get_async_url())
            await self._database.connect()
            
            # Create all tables
            async with self.async_engine.begin() as conn:
                await conn.run_sync(BaseModel.metadata.create_all)
            
            self._is_initialized = True
            logger.info("Database initialized successfully")
            
        except Exception as e:
            logger.error("Failed to initialize database: %s", str(e))
            raise ConnectionError(f"Failed to initialize database: {str(e)}") from e
    
    async def close(self) -> None:
        """Close all database connections."""
        try:
            if self._database:
                await self._database.disconnect()
                self._database = None
            
            if self._async_engine:
                await self._async_engine.dispose()
                self._async_engine = None
            
            if self._sync_engine:
                self._sync_engine.dispose()
                self._sync_engine = None
            
            self._async_session_factory = None
            self._is_initialized = False
            
            logger.info("Database connections closed successfully")
            
        except Exception as e:
            logger.error("Error closing database connections: %s", str(e))
            raise DatabaseError(f"Error closing database connections: {str(e)}") from e
    
    async def _test_async_connection(self) -> None:
        """Test async database connection."""
        max_retries = self.config.retry_attempts
        retry_delay = self.config.retry_delay
        
        for attempt in range(max_retries):
            try:
                async with self.async_engine.begin() as conn:
                    await conn.execute(text("SELECT 1"))
                logger.info("Async database connection test successful")
                return
                
            except (OperationalError, DisconnectionError) as e:
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                    logger.warning(
                        "Database connection attempt %d failed, retrying in %.2f seconds: %s",
                        attempt + 1, wait_time, str(e)
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error("All database connection attempts failed")
                    raise ConnectionError(f"Database connection failed after {max_retries} attempts") from e
    
    async def health_check(self) -> Dict[str, Any]:
        """
        Perform database health check.
        
        Returns:
            Dictionary containing health check results
        """
        health_status = {
            "status": "unhealthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": {}
        }
        
        try:
            # Test async connection
            start_time = datetime.now(timezone.utc)
            async with self.async_engine.begin() as conn:
                result = await conn.execute(text("SELECT 1 as test"))
                test_value = result.scalar()
            
            end_time = datetime.now(timezone.utc)
            response_time = (end_time - start_time).total_seconds() * 1000  # ms
            
            if test_value == 1:
                health_status.update({
                    "status": "healthy",
                    "details": {
                        "response_time_ms": round(response_time, 2),
                        "connection_pool_size": self.async_engine.pool.size() if hasattr(self.async_engine, 'pool') else None,
                        "checked_out_connections": self.async_engine.pool.checkedout() if hasattr(self.async_engine, 'pool') else None,
                    }
                })
            
        except Exception as e:
            health_status["details"]["error"] = str(e)
            logger.error("Database health check failed: %s", str(e))
        
        return health_status
    
    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """
        Get database session with proper cleanup.
        
        Yields:
            AsyncSession instance
        """
        if not self._is_initialized:
            await self.initialize()
        
        session = self.session_factory()
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error("Session error, rolled back: %s