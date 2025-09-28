"""
FastAPI Application Configuration and Setup Module

This module contains the main FastAPI application factory and configuration.
Handles middleware setup, routing, database initialization, and lifecycle events.
"""

import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

# Third-party imports
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Local imports
from core.database import DatabaseManager, get_database
from core.auth import JWTAuthMiddleware, get_current_user
from core.config import get_settings
from api.tasks import router as tasks_router
from api.users import router as users_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global database manager instance
db_manager: DatabaseManager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager for startup and shutdown events.
    
    Handles database initialization on startup and cleanup on shutdown.
    """
    global db_manager
    
    # Startup events
    logger.info("Starting up Task Management API...")
    
    try:
        # Initialize database manager
        settings = get_settings()
        db_manager = DatabaseManager(settings.database_url)
        
        # Initialize database connection pool
        await db_manager.initialize()
        logger.info("Database connection pool initialized successfully")
        
        # Create database tables
        await db_manager.create_tables()
        logger.info("Database tables created/verified successfully")
        
        # Test database connection
        async with db_manager.get_connection() as conn:
            await conn.execute("SELECT 1")
        logger.info("Database connection test successful")
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise RuntimeError(f"Database initialization failed: {str(e)}")
    
    logger.info("Application startup completed successfully")
    
    yield
    
    # Shutdown events
    logger.info("Shutting down Task Management API...")
    
    try:
        if db_manager:
            await db_manager.close()
            logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")
    
    logger.info("Application shutdown completed")


def create_application() -> FastAPI:
    """
    FastAPI application factory function.
    
    Creates and configures the FastAPI application with all necessary
    middleware, routers, and dependencies.
    
    Returns:
        FastAPI: Configured FastAPI application instance
    """
    settings = get_settings()
    
    # Create FastAPI application instance
    app = FastAPI(
        title="Task Management API",
        version="1.0.0",
        description="A comprehensive task management system with user authentication",
        docs_url="/docs" if settings.environment == "development" else None,
        redoc_url="/redoc" if settings.environment == "development" else None,
        lifespan=lifespan
    )
    
    # Configure CORS middleware (must be added before other middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,  # ["http://localhost:3000"] for development
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
        allow_headers=["*"],
        expose_headers=["*"]
    )
    
    # Add JWT authentication middleware
    app.add_middleware(JWTAuthMiddleware)
    
    # Include API routers with prefixes
    app.include_router(
        tasks_router,
        prefix="/api/tasks",
        tags=["tasks"],
        dependencies=[Depends(get_current_user)]  # Protect all task routes
    )
    
    app.include_router(
        users_router,
        prefix="/api/users",
        tags=["users"]
    )
    
    return app


# Create application instance
app = create_application()


@app.get("/health", tags=["health"])
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint for monitoring application and database status.
    
    Returns:
        Dict[str, Any]: Health status information including database connectivity
        
    Raises:
        HTTPException: If critical services are unavailable
    """
    health_status = {
        "status": "healthy",
        "service": "Task Management API",
        "version": "1.0.0",
        "database": "disconnected"
    }
    
    # Check database connection
    try:
        if db_manager is None:
            raise Exception("Database manager not initialized")
            
        async with db_manager.get_connection() as conn:
            # Simple query to test connection
            result = await conn.execute("SELECT 1 as health_check")
            if result:
                health_status["database"] = "connected"
                logger.debug("Health check: Database connection successful")
            else:
                raise Exception("Database query returned no result")
                
    except Exception as e:
        logger.error(f"Health check database error: {str(e)}")
        health_status["status"] = "unhealthy"
        health_status["database"] = "disconnected"
        health_status["error"] = str(e)
        
        # Return 503 Service Unavailable if database is down
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=health_status
        )
    
    return health_status


@app.get("/", tags=["root"])
async def root() -> Dict[str, str]:
    """
    Root endpoint providing basic API information.
    
    Returns:
        Dict[str, str]: Basic API information
    """
    return {
        "message": "Task Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """
    Global HTTP exception handler for consistent error responses.
    
    Args:
        request: The incoming request object
        exc: The HTTPException that was raised
        
    Returns:
        JSONResponse: Formatted error response
    """
    logger.warning(
        f"HTTP {exc.status_code} error on {request.method} {request.url}: {exc.detail}"
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "status_code": exc.status_code,
            "message": exc.detail,
            "path": str(request.url)
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc: Exception):
    """
    Global exception handler for unhandled exceptions.
    
    Args:
        request: The incoming request object
        exc: The unhandled exception
        
    Returns:
        JSONResponse: Generic error response
    """
    logger.error(
        f"Unhandled exception on {request.method} {request.url}: {str(exc)}",
        exc_info=True
    )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": True,
            "status_code": 500,
            "message": "Internal server error",
            "path": str(request.url)
        }
    )


# Dependency to get database connection
async def get_db_connection():
    """
    Dependency function to provide database connections to route handlers.
    
    Yields:
        Database connection object
        
    Raises:
        HTTPException: If database connection fails
    """
    if db_manager is None:
        logger.error("Database manager not initialized")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable"
        )
    
    try:
        async with db_manager.get_connection() as conn:
            yield conn
    except Exception as e:
        logger.error(f"Database connection error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed"
        )


# Make the database dependency available for import
__all__ = ["app", "get_db_connection"]