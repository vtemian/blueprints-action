"""
Database connection and session management module for FastAPI applications.

This module provides comprehensive database connectivity using SQLAlchemy 2.0+
with support for both synchronous and asynchronous operations, proper session
management, and SQLite-specific optimizations.
"""

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Generator, Optional

from databases import Database
from sqlalchemy import (
    DateTime,
    String,
    create_engine,
    event,
    pool,
    text,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.declarative import DeclarativeBase
from sqlalchemy.orm import (
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator, CHAR

# Configure logging
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tasks.db")
ASYNC_DATABASE_URL = os.getenv("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///./tasks.db")
DATABASE_ECHO = os.getenv("DATABASE_ECHO", "false").lower() == "true"
MAX_RETRIES = int(os.getenv("DB_MAX_RETRIES", "3"))
RETRY_DELAY = float(os.getenv("DB_RETRY_DELAY", "1.0"))


class GUID(TypeDecorator):
    """
    Platform-independent GUID type.
    Uses PostgreSQL's UUID type, otherwise uses CHAR(36), storing as stringified hex values.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(dialect.UUID())
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
            else:
                return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
            return value


def configure_sqlite_engine(engine):
    """Configure SQLite-specific settings for optimal performance and reliability."""
    
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """Set SQLite pragma settings for better performance and reliability."""
        cursor = dbapi_connection.cursor()
        
        # Enable WAL mode for better concurrency
        cursor.execute("PRAGMA journal_mode=WAL")
        
        # Enable foreign key constraints
        cursor.execute("PRAGMA foreign_keys=ON")
        
        # Set synchronous mode to NORMAL for better performance
        cursor.execute("PRAGMA synchronous=NORMAL")
        
        # Set cache size (negative value means KB)
        cursor.execute("PRAGMA cache_size=-64000")  # 64MB cache
        
        # Set temp store to memory
        cursor.execute("PRAGMA temp_store=MEMORY")
        
        # Set mmap size for better I/O performance
        cursor.execute("PRAGMA mmap_size=268435456")  # 256MB
        
        cursor.close()


def create_database_directory():
    """Ensure the database directory exists."""
    if DATABASE_URL.startswith("sqlite:///"):
        db_path = DATABASE_URL.replace("sqlite:///", "")
        db_dir = Path(db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Database directory ensured: {db_dir}")


# Create database engines
create_database_directory()

# Synchronous engine
engine = create_engine(
    DATABASE_URL,
    echo=DATABASE_ECHO,
    poolclass=pool.StaticPool if DATABASE_URL.startswith("sqlite") else None,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
    pool_recycle=3600,  # Recycle connections every hour
)

# Configure SQLite-specific settings
if DATABASE_URL.startswith("sqlite"):
    configure_sqlite_engine(engine)

# Asynchronous engine
async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=DATABASE_ECHO,
    poolclass=pool.StaticPool if ASYNC_DATABASE_URL.startswith("sqlite") else None,
    connect_args={"check_same_thread": False} if ASYNC_DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Session factories
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

# Database instance for async operations
database = Database(ASYNC_DATABASE_URL)


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
        return f"<{self.__class__.__name__}(id={self.id})>"


# Database dependency functions
def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency function for database sessions.
    
    Provides a database session with proper cleanup and error handling.
    
    Yields:
        Session: SQLAlchemy database session
        
    Example:
        @app.get("/items/")
        def read_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = SessionLocal()
    try:
        logger.debug("Database session created")
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()
        logger.debug("Database session closed")


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency function for async database sessions.
    
    Provides an async database session with proper cleanup and error handling.
    
    Yields:
        AsyncSession: SQLAlchemy async database session
        
    Example:
        @app.get("/items/")
        async def read_items(db: AsyncSession = Depends(get_async_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()
    """
    async with AsyncSessionLocal() as session:
        try:
            logger.debug("Async database session created")
            yield session
        except Exception as e:
            logger.error(f"Async database session error: {e}")
            await session.rollback()
            raise
        finally:
            await session.close()
            logger.debug("Async database session closed")


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for database sessions outside of FastAPI.
    
    Yields:
        Session: SQLAlchemy database session
        
    Example:
        with get_db_context() as db:
            items = db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        logger.error(f"Database context error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


@asynccontextmanager
async def get_async_db_context() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager for database sessions outside of FastAPI.
    
    Yields:
        AsyncSession: SQLAlchemy async database session
        
    Example:
        async with get_async_db_context() as db:
            result = await db.execute(select(Item))
            items = result.scalars().all()
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            logger.error(f"Async database context error: {e}")
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db(max_retries: int = MAX_RETRIES, retry_delay: float = RETRY_DELAY) -> None:
    """
    Initialize the database and create all tables.
    
    Args:
        max_retries: Maximum number of connection retry attempts
        retry_delay: Delay between retry attempts in seconds
        
    Raises:
        Exception: If database initialization fails after all retries
        
    Example:
        # In your FastAPI startup event
        @app.on_event("startup")
        async def startup_event():
            await init_db()
    """
    for attempt in range(max_retries):
        try:
            logger.info(f"Initializing database (attempt {attempt + 1}/{max_retries})")
            
            # Connect to the database
            await database.connect()
            
            # Create all tables using the sync engine
            # Note: We use the sync engine for table creation as it's more reliable
            Base.metadata.create_all(bind=engine)
            
            # Test the connection with a simple query
            async with AsyncSessionLocal() as session:
                result = await session.execute(text("SELECT 1"))
                result.scalar()
            
            logger.info("Database initialized successfully")
            return
            
        except Exception as e:
            logger.error(f"Database initialization attempt {attempt + 1} failed: {e}")
            
            if attempt < max_retries - 1:
                logger.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
            else:
                logger.error("All database initialization attempts failed")
                raise Exception(f"Failed to initialize database after {max_retries} attempts: {e}")


async def close_db() -> None:
    """
    Close database connections and cleanup resources.
    
    Should be called during application shutdown to ensure proper cleanup.
    
    Example:
        @app.on_event("shutdown")
        async def shutdown_event():
            await close_db()
    """
    try:
        logger.info("Closing database connections")
        
        # Disconnect from the database
        if database.is_connected:
            await database.disconnect()
        
        # Dispose of the async engine
        await async_engine.dispose()
        
        # Dispose of the sync engine
        engine.dispose()
        
        logger.info("Database connections closed successfully")
        
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")
        raise


async def check_db_health() -> bool:
    """
    Check database connectivity and health.
    
    Returns:
        bool: True if database is healthy, False otherwise
        
    Example:
        @app.get("/health/db")
        async def db_health():
            is_healthy = await check_db_health()
            return {"database": "healthy" if is_healthy else "unhealthy"}
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            result.scalar()
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False


def create_tables() -> None:
    """
    Create all database tables synchronously.
    
    Useful for testing or when async initialization is not needed.
    
    Example:
        # In tests or simple scripts
        create_tables()
    """
    try:
        logger.info("Creating database tables")
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")
        raise


def drop_tables() -> None:
    """
    Drop all database tables synchronously.
    
    WARNING: This will delete all data! Use with caution.
    
    Example:
        # In tests for cleanup
        drop_tables()
    """
    try:
        logger.warning("Dropping all database tables")
        Base.metadata.drop_all(bind=engine)
        logger.info("Database tables dropped successfully")
    except Exception as e:
        logger.error(f"Failed to drop database tables: {e}")
        raise


# Example usage and testing functions
if __name__ == "__main__":
    import asyncio
    
    async def test_database():
        """Test database connectivity and basic operations."""
        try:
            # Initialize database
            await init_db()
            
            # Test sync session
            with get_db_context() as db:
                result = db.execute(text("SELECT 1")).scalar()
                print(f"Sync query result: {result}")
            
            # Test async session
            async with get_async_db_context() as db:
                result = await db.execute(text("SELECT 1"))
                value = result.scalar()
                print(f"Async query result: {value}")
            
            # Test health check
            is_healthy = await check_db_health()
            print(f"Database health: {'OK' if is_healthy else 'FAILED'}")
            
            print("Database test completed successfully!")
            
        except Exception as e:
            print(f"Database test failed: {e}")
        finally:
            await close_db()
    
    # Run the test
    asyncio.run(test_database())