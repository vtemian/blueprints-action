"""
Database connection and session management module.

This module provides async SQLAlchemy database operations using the databases library,
with proper connection pooling, session management, and FastAPI dependency injection.
"""

import os
import logging
from typing import AsyncGenerator, Optional
from datetime import datetime
import uuid

import sqlalchemy
from sqlalchemy import Column, String, DateTime, create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from databases import Database

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tasks.db")

# Validate database URL format
if not DATABASE_URL or not isinstance(DATABASE_URL, str):
    raise ValueError("DATABASE_URL must be a valid database connection string")

# SQLAlchemy engine configuration
engine_kwargs = {
    "echo": False,  # Set to True for SQL query logging in development
    "future": True,
}

# Add SQLite-specific configuration
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update({
        "connect_args": {"check_same_thread": False},
        "poolclass": sqlalchemy.pool.StaticPool,
    })
else:
    # PostgreSQL/MySQL connection pool settings
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 0,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    })

# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL, **engine_kwargs)

# Create async database instance
database = Database(DATABASE_URL)

# Create metadata and declarative base
metadata = MetaData()
Base = declarative_base(metadata=metadata)

# Session factory configuration
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


class BaseModel(Base):
    """
    Base model class with common fields for all database models.
    
    Provides UUID primary key and automatic timestamp management.
    """
    __abstract__ = True
    
    id = Column(
        UUID(as_uuid=True) if not DATABASE_URL.startswith("sqlite") else String(36),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        nullable=False,
        doc="Unique identifier for the record"
    )
    
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when the record was created"
    )
    
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        doc="Timestamp when the record was last updated"
    )
    
    def __repr__(self) -> str:
        """String representation of the model instance."""
        return f"<{self.__class__.__name__}(id={self.id})>"


async def get_db() -> AsyncGenerator[Session, None]:
    """
    FastAPI dependency function for database session management.
    
    Provides an async context manager for database sessions with proper
    error handling and cleanup.
    
    Yields:
        Session: SQLAlchemy database session
        
    Raises:
        Exception: Database connection or session errors
    """
    session: Optional[Session] = None
    try:
        # Create new database session
        session = SessionLocal()
        logger.debug("Database session created")
        yield session
        
    except Exception as e:
        logger.error(f"Database session error: {str(e)}")
        if session:
            session.rollback()
            logger.info("Database session rolled back due to error")
        raise
        
    finally:
        if session:
            session.close()
            logger.debug("Database session closed")


async def init_db() -> None:
    """
    Initialize database by creating all tables.
    
    Creates all tables defined in the Base metadata and establishes
    the database connection.
    
    Raises:
        Exception: Database initialization errors
    """
    try:
        logger.info("Initializing database...")
        
        # Connect to database
        await database.connect()
        logger.info(f"Connected to database: {DATABASE_URL}")
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        raise


async def close_db() -> None:
    """
    Close database connections and cleanup resources.
    
    Properly disconnects from the database and disposes of the engine
    connection pool.
    
    Raises:
        Exception: Database cleanup errors
    """
    try:
        logger.info("Closing database connections...")
        
        # Disconnect from database
        if database.is_connected:
            await database.disconnect()
            logger.info("Database disconnected successfully")
        
        # Dispose of engine connection pool
        engine.dispose()
        logger.info("Database engine disposed successfully")
        
    except Exception as e:
        logger.error(f"Database cleanup error: {str(e)}")
        raise


async def check_db_connection() -> bool:
    """
    Check if database connection is healthy.
    
    Returns:
        bool: True if connection is healthy, False otherwise
    """
    try:
        if not database.is_connected:
            await database.connect()
        
        # Execute a simple query to test connection
        query = "SELECT 1"
        await database.fetch_one(query)
        logger.info("Database connection is healthy")
        return True
        
    except Exception as e:
        logger.error(f"Database connection check failed: {str(e)}")
        return False


def get_sync_db() -> Session:
    """
    Get synchronous database session for non-async operations.
    
    Returns:
        Session: SQLAlchemy database session
        
    Note:
        Remember to close the session manually when using this function.
    """
    return SessionLocal()


# Database connection context manager for manual session management
class DatabaseSession:
    """
    Context manager for manual database session management.
    
    Usage:
        async with DatabaseSession() as session:
            # Use session for database operations
            pass
    """
    
    def __init__(self):
        self.session: Optional[Session] = None
    
    async def __aenter__(self) -> Session:
        """Enter the async context manager."""
        self.session = SessionLocal()
        return self.session
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit the async context manager with proper cleanup."""
        if self.session:
            if exc_type:
                self.session.rollback()
                logger.info("Database session rolled back due to exception")
            self.session.close()
            logger.debug("Database session closed")


# Export list for module
__all__ = [
    "database",
    "engine",
    "Base",
    "BaseModel",
    "SessionLocal",
    "get_db",
    "get_sync_db",
    "init_db",
    "close_db",
    "check_db_connection",
    "DatabaseSession",
    "DATABASE_URL",
]