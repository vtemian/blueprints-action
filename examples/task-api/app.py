"""
FastAPI application configuration and setup for Task Management API.

This module initializes the FastAPI application with proper middleware,
routing, authentication, and database configuration.
"""

import logging
import os
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Local imports
try:
    from api.tasks import router as tasks_router
    from api.users import router as users_router
    from core.database import init_db, get_db_status
    from core.auth import JWTMiddleware
except ImportError as e:
    logging.error(f"Failed to import required modules: {e}")
    raise

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize FastAPI application
app = FastAPI(
    title="Task Management API",
    version="1.0.0",
    description="A comprehensive task management system with user authentication",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
def get_cors_origins() -> list[str]:
    """
    Get CORS origins from environment variables with fallback to localhost.
    
    Returns:
        List of allowed origins for CORS configuration.
    """
    origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in origins.split(",")]

# Configure CORS middleware
try:
    allowed_origins = get_cors_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )
    logger.info(f"CORS configured with origins: {allowed_origins}")
except Exception as e:
    logger.error(f"Failed to configure CORS middleware: {e}")
    # Add default CORS configuration as fallback
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

# Configure JWT Authentication middleware
try:
    app.add_middleware(JWTMiddleware)
    logger.info("JWT authentication middleware configured successfully")
except Exception as e:
    logger.error(f"Failed to configure JWT middleware: {e}")
    # Continue without JWT middleware but log the error
    pass

# Health check endpoint
@app.get(
    "/health",
    tags=["Health"],
    summary="Health Check",
    description="Check the health status of the API and database connection"
)
async def health_check() -> Dict[str, str]:
    """
    Health check endpoint to verify API and database status.
    
    Returns:
        Dict containing status information for API and database.
        
    Raises:
        HTTPException: If there are critical system failures.
    """
    try:
        # Check database status
        db_status = await get_db_status()
        
        return {
            "status": "healthy",
            "database": "connected" if db_status else "disconnected",
            "version": "1.0.0"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "healthy",
            "database": "disconnected",
            "version": "1.0.0",
            "error": "Database connection check failed"
        }

# Include API routers
try:
    app.include_router(
        tasks_router,
        prefix="/api/tasks",
        tags=["Tasks"]
    )
    logger.info("Tasks router included successfully")
except Exception as e:
    logger.error(f"Failed to include tasks router: {e}")

try:
    app.include_router(
        users_router,
        prefix="/api/users",
        tags=["Users"]
    )
    logger.info("Users router included successfully")
except Exception as e:
    logger.error(f"Failed to include users router: {e}")

# Startup event handlers
@app.on_event("startup")
async def startup_event() -> None:
    """
    Initialize application on startup.
    
    Performs database initialization and connection pool setup.
    Handles errors gracefully to prevent application crash.
    """
    logger.info("Starting Task Management API...")
    
    try:
        # Initialize database tables and connection pool
        await init_db()
        logger.info("Database initialized successfully")
        
        # Verify database connection
        db_status = await get_db_status()
        if db_status:
            logger.info("Database connection verified")
        else:
            logger.warning("Database connection could not be verified")
            
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        # Log error but don't crash the application
        # The health check endpoint will report database status
        pass
    
    logger.info("Task Management API startup completed")

# Shutdown event handlers
@app.on_event("shutdown")
async def shutdown_event() -> None:
    """
    Clean up resources on application shutdown.
    """
    logger.info("Shutting down Task Management API...")
    
    try:
        # Add any cleanup logic here (close database connections, etc.)
        logger.info("Cleanup completed successfully")
    except Exception as e:
        logger.error(f"Error during shutdown cleanup: {e}")
    
    logger.info("Task Management API shutdown completed")

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception) -> JSONResponse:
    """
    Global exception handler for unhandled exceptions.
    
    Args:
        request: The incoming request object.
        exc: The exception that was raised.
        
    Returns:
        JSONResponse with error details.
    """
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "type": "internal_error"
        }
    )

# Root endpoint
@app.get(
    "/",
    tags=["Root"],
    summary="API Root",
    description="Root endpoint providing API information"
)
async def root() -> Dict[str, Any]:
    """
    Root endpoint providing basic API information.
    
    Returns:
        Dict containing API metadata and available endpoints.
    """
    return {
        "message": "Welcome to Task Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "api": {
            "tasks": "/api/tasks",
            "users": "/api/users"
        }
    }

# Export the app instance for ASGI servers
__all__ = ["app"]

if __name__ == "__main__":
    import uvicorn
    
    # Development server configuration
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )