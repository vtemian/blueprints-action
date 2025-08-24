"""
Database connection and session management module for FastAPI application.

This module provides async database connectivity using SQLAlchemy 2.0+ with SQLite,
including proper session management, connection pooling, and base model definitions.
"""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncGenerator, Optional

from databases import Database
from sqlalchemy import (
    DateTime,
    MetaData,
    String,
    event,
    pool,
)
from sqlalchemy.dialects.sqlite import UUID as SQLiteUUID
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import StaticPool
from sqlalchemy.sql import func

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================

logger = logging.getLogger(__name__)


# ============================================================================
# DATABASE CONFIGURATION
# ============================================================================

# Environment variable validation with fallback
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tasks.db")

# Convert SQLite URL to async format if needed
if DATABASE_URL.startswith("sqlite:///"):
    ASYNC_DATABASE_URL = DATABASE_URL.replace("sqlite:///", "sqlite+aiosqlite:///")
elif DATABASE_URL.startswith("sqlite://"):
    ASYNC_DATABASE_URL = DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://")
else:
    ASYNC_DATABASE_URL = DATABASE_URL

logger.info(f"Database URL configured: {ASYNC_DATABASE_URL}")


# ============================================================================
# SQLALCHEMY ENGINE AND SESSION CONFIGURATION
# ============================================================================

# Create async engine with SQLite-specific configuration
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    # SQLite-specific pool configuration
    poolclass=StaticPool,
    pool_pre_ping=True,
    pool_recycle=300,  # Recycle connections every 5 minutes
    connect_args={
        "check_same_thread": False,  # Allow SQLite to be used across threads
        "timeout": 20,  # Connection timeout in seconds
    },
    echo=os.getenv("DATABASE_ECHO", "false").lower() == "true",  # SQL logging
    future=True,  # Use SQLAlchemy 2.0 style
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=True,
    autocommit=False,
)

# Database instance for direct queries if needed
database = Database(ASYNC_DATABASE_URL)


# ============================================================================
# DECLARATIVE BASE AND METADATA
# ============================================================================

class Base(DeclarativeBase):
    """Base class for all database models."""
    
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s"
        }
    )


# ============================================================================
# BASE MODEL CLASS
# ============================================================================

class BaseModel(Base):
    """
    Base model class with common fields for all database models.
    
    Provides:
    - UUID primary key
    - Automatic timestamp management
    - Common model functionality
    """
    
    __abstract__ = True
    
    # UUID primary key
    id: Mapped[str] = mapped_column(
        SQLiteUUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        unique=True,
        nullable=False,
        doc="Unique identifier for the record"
    )
    
    # Timestamp fields with automatic management
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when the record was created"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        doc="Timestamp when the record was last updated"
    )
    
    def __repr__(self) -> str:
        """String representation of the model."""
        return f"<{self.__class__.__name__}(id={self.id})>"


# ============================================================================
# DATABASE EVENT LISTENERS
# ============================================================================

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Set SQLite pragmas for better performance and reliability."""
    cursor = dbapi_connection.cursor()
    
    # Enable foreign key constraints
    cursor.execute("PRAGMA foreign_keys=ON")
    
    # Set WAL mode for better concurrency
    cursor.execute("PRAGMA journal_mode=WAL")
    
    # Set synchronous mode for better performance
    cursor.execute("PRAGMA synchronous=NORMAL")
    
    # Set cache size (negative value means KB)
    cursor.execute("PRAGMA cache_size=-64000")  # 64MB cache
    
    # Set temp store to memory
    cursor.execute("PRAGMA temp_store=MEMORY")
    
    cursor.close()
    logger.debug("SQLite pragmas configured successfully")


# ============================================================================
# SESSION MANAGEMENT FUNCTIONS
# ============================================================================

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency function for database sessions.
    
    Provides proper session lifecycle management with automatic cleanup.
    
    Yields:
        AsyncSession: Database session for the request
        
    Raises:
        Exception: Database connection or session errors
    """
    session = AsyncSessionLocal()
    try:
        logger.debug("Database session created")
        yield session
        await session.commit()
        logger.debug("Database session committed successfully")
    except Exception as e:
        logger.error(f"Database session error: {str(e)}")
        await session.rollback()
        logger.debug("Database session rolled back")
        raise
    finally:
        await session.close()
        logger.debug("Database session closed")


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database sessions outside of FastAPI requests.
    
    Usage:
        async with get_db_context() as db:
            # Use db session here
            result = await db.execute(query)
    
    Yields:
        AsyncSession: Database session
        
    Raises:
        Exception: Database connection or session errors
    """
    session = AsyncSessionLocal()
    try:
        logger.debug("Database context session created")
        yield session
        await session.commit()
        logger.debug("Database context session committed")
    except Exception as e:
        logger.error(f"Database context session error: {str(e)}")
        await session.rollback()
        logger.debug("Database context session rolled back")
        raise
    finally:
        await session.close()
        logger.debug("Database context session closed")


# ============================================================================
# DATABASE INITIALIZATION AND CLEANUP
# ============================================================================

async def init_db() -> None:
    """
    Initialize the database and create all tables.
    
    This function should be called during application startup.
    
    Raises:
        Exception: Database initialization errors
    """
    try:
        logger.info("Initializing database...")
        
        # Connect to database
        await database.connect()
        logger.debug("Database connection established")
        
        # Create all tables
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("Database initialized successfully")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        raise
    finally:
        # Disconnect from database after initialization
        if database.is_connected:
            await database.disconnect()
            logger.debug("Database disconnected after initialization")


async def close_db() -> None:
    """
    Cleanup database connections and resources.
    
    This function should be called during application shutdown.
    
    Raises:
        Exception: Database cleanup errors
    """
    try:
        logger.info("Closing database connections...")
        
        # Disconnect database if connected
        if database.is_connected:
            await database.disconnect()
            logger.debug("Database disconnected")
        
        # Dispose of engine
        await engine.dispose()
        logger.info("Database connections closed successfully")
        
    except Exception as e:
        logger.error(f"Error closing database connections: {str(e)}")
        raise


# ============================================================================
# HEALTH CHECK FUNCTION
# ============================================================================

async def check_db_health() -> bool:
    """
    Check database connectivity and health.
    
    Returns:
        bool: True if database is healthy, False otherwise
    """
    try:
        async with get_db_context() as db:
            # Simple query to test connectivity
            result = await db.execute("SELECT 1")
            await result.fetchone()
        
        logger.debug("Database health check passed")
        return True
        
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return False


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

"""
Example usage in FastAPI application:

# main.py
from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db, init_db, close_db

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    await init_db()

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()

@app.get("/items/")
async def read_items(db: AsyncSession = Depends(get_db)):
    # Use db session here
    result = await db.execute("SELECT * FROM items")
    return result.fetchall()

# models.py
from core.database import BaseModel
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String

class Item(BaseModel):
    __tablename__ = "items"
    
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500))
"""

# Export commonly used components
__all__ = [
    "Base",
    "BaseModel",
    "engine",
    "AsyncSessionLocal",
    "database",
    "get_db",
    "get_db_context",
    "init_db",
    "close_db",
    "check_db_health",
]