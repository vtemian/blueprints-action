"""
FastAPI Application Setup Module

This module contains the main FastAPI application configuration including
middleware setup, router registration, database initialization, and health checks.
"""

# Standard library imports
import logging
from typing import Dict, Any

# Third-party imports
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Local imports
from core.database import init_database, check_database_connection
from core.auth import JWTAuthMiddleware
from api.tasks import router as tasks_router
from api.users import router as users_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI application instance
app = FastAPI(
    title="Task Management API",
    version="1.0.0",
    description="A comprehensive task management API with user authentication and CRUD operations",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With"
    ],
)

# Add JWT authentication middleware
app.add_middleware(JWTAuthMiddleware)

# Include API routers with prefix
app.include_router(
    tasks_router,
    prefix="/api",
    tags=["tasks"]
)

app.include_router(
    users_router,
    prefix="/api",
    tags=["users"]
)


@app.on_event("startup")
async def startup_event() -> None:
    """
    Initialize application on startup.
    
    Performs database initialization and any other required startup tasks.
    Includes proper error handling and logging for startup failures.
    """
    try:
        logger.info("Starting Task Management API...")
        
        # Initialize database connection and tables
        await init_database()
        logger.info("Database initialization completed successfully")
        
        # Verify database connection
        is_connected = await check_database_connection()
        if not is_connected:
            raise Exception("Database connection verification failed")
            
        logger.info("Application startup completed successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize application: {str(e)}")
        # In production, you might want to exit the application
        # or implement retry logic
        raise RuntimeError(f"Application startup failed: {str(e)}")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """
    Cleanup tasks on application shutdown.
    """
    logger.info("Shutting down Task Management API...")
    # Add any cleanup tasks here (close database connections, etc.)


@app.get(
    "/health",
    response_model=Dict[str, str],
    status_code=status.HTTP_200_OK,
    summary="Health Check",
    description="Check the health status of the API and database connection"
)
async def health_check() -> Dict[str, str]:
    """
    Health check endpoint that returns the status of the API and database connection.
    
    Returns:
        Dict[str, str]: JSON response containing status and database connection info
        
    Raises:
        HTTPException: 503 Service Unavailable if database connection fails
    """
    try:
        # Check database connection
        is_db_connected = await check_database_connection()
        
        if not is_db_connected:
            logger.error("Health check failed: Database connection unavailable")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "status": "unhealthy",
                    "database": "disconnected",
                    "message": "Database connection failed"
                }
            )
        
        logger.info("Health check passed successfully")
        return {
            "status": "healthy",
            "database": "connected"
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Health check failed with unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unhealthy",
                "database": "unknown",
                "message": f"Health check failed: {str(e)}"
            }
        )


@app.get(
    "/",
    response_model=Dict[str, Any],
    status_code=status.HTTP_200_OK,
    summary="API Root",
    description="Root endpoint providing API information"
)
async def root() -> Dict[str, Any]:
    """
    Root endpoint that provides basic API information.
    
    Returns:
        Dict[str, Any]: Basic API information and available endpoints
    """
    return {
        "message": "Welcome to Task Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "api_prefix": "/api"
    }


# Custom exception handlers
@app.exception_handler(404)
async def not_found_handler(request, exc) -> JSONResponse:
    """Handle 404 Not Found errors with custom response."""
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": "The requested resource was not found",
            "path": str(request.url.path)
        }
    )


@app.exception_handler(500)
async def internal_server_error_handler(request, exc) -> JSONResponse:
    """Handle 500 Internal Server Error with custom response."""
    logger.error(f"Internal server error on {request.url.path}: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred. Please try again later."
        }
    )


# Application metadata
def get_app_info() -> Dict[str, Any]:
    """
    Get application information and configuration details.
    
    Returns:
        Dict[str, Any]: Application configuration information
    """
    return {
        "title": app.title,
        "version": app.version,
        "description": app.description,
        "cors_origins": ["http://localhost:3000"],
        "api_prefix": "/api",
        "health_endpoint": "/health"
    }


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