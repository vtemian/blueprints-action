"""
FastAPI Application Configuration and Setup
Production-ready Task Management API with proper middleware, authentication, and error handling.
"""

import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

# Import routers
from api.tasks import router as tasks_router
from api.users import router as users_router

# Import core modules
from core.database import DatabaseManager, get_database_status
from core.auth import JWTAuthMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global database manager instance
db_manager = DatabaseManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    Handles database initialization and cleanup.
    """
    # Startup
    logger.info("Starting Task Management API...")
    
    try:
        # Initialize database connection pool
        await db_manager.initialize()
        logger.info("Database connection pool initialized successfully")
        
        # Create database tables
        await db_manager.create_tables()
        logger.info("Database tables created/verified successfully")
        
        # Test database connectivity
        db_status = await get_database_status()
        if db_status != "connected":
            raise Exception(f"Database connectivity test failed: {db_status}")
        
        logger.info("Application startup completed successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize application: {str(e)}")
        # In production, you might want to exit the application
        # For now, we'll log the error and continue
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service temporarily unavailable due to startup failure"
        )
    
    yield
    
    # Shutdown
    logger.info("Shutting down Task Management API...")
    try:
        await db_manager.close()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")


# Create FastAPI application instance
app = FastAPI(
    title="Task Management API",
    version="1.0.0",
    description="A production-ready task management API with user authentication",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)


# Configure CORS middleware (must be added first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Development frontend
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

# Add JWT authentication middleware for protected routes
app.add_middleware(JWTAuthMiddleware)


# Global exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTP exceptions with consistent JSON response format."""
    logger.warning(f"HTTP {exc.status_code} error on {request.url}: {exc.detail}")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "type": "http_error"
            },
            "path": str(request.url),
            "method": request.method
        }
    )


@app.exception_handler(StarletteHTTPException)
async def starlette_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle Starlette HTTP exceptions."""
    logger.warning(f"Starlette HTTP {exc.status_code} error on {request.url}: {exc.detail}")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "type": "http_error"
            },
            "path": str(request.url),
            "method": request.method
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle request validation errors with detailed field information."""
    logger.warning(f"Validation error on {request.url}: {exc.errors()}")
    
    # Format validation errors for better client understanding
    formatted_errors = []
    for error in exc.errors():
        formatted_errors.append({
            "field": " -> ".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"]
        })
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": 422,
                "message": "Validation error",
                "type": "validation_error",
                "details": formatted_errors
            },
            "path": str(request.url),
            "method": request.method
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    logger.error(f"Unexpected error on {request.url}: {str(exc)}", exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": 500,
                "message": "Internal server error",
                "type": "internal_error"
            },
            "path": str(request.url),
            "method": request.method
        }
    )


# Include API routers
app.include_router(
    tasks_router,
    prefix="/api/tasks",
    tags=["tasks"]
)

app.include_router(
    users_router,
    prefix="/api/users",
    tags=["users"]
)


# Health check endpoint
@app.get("/health", tags=["health"])
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint that verifies API and database connectivity.
    Returns detailed status information for monitoring systems.
    """
    try:
        # Test database connectivity
        db_status = await get_database_status()
        
        # Determine overall health
        is_healthy = db_status == "connected"
        
        response = {
            "status": "healthy" if is_healthy else "unhealthy",
            "database": db_status,
            "timestamp": db_manager.get_current_timestamp(),
            "version": "1.0.0"
        }
        
        # Return appropriate HTTP status
        status_code = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
        
        return JSONResponse(
            status_code=status_code,
            content=response
        )
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "database": "error",
                "error": str(e),
                "timestamp": db_manager.get_current_timestamp(),
                "version": "1.0.0"
            }
        )


# Root endpoint
@app.get("/", tags=["root"])
async def root() -> Dict[str, str]:
    """Root endpoint with API information."""
    return {
        "message": "Task Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


# Additional utility endpoints for monitoring
@app.get("/api/status", tags=["monitoring"])
async def api_status() -> Dict[str, Any]:
    """
    Detailed API status endpoint for monitoring and debugging.
    """
    try:
        db_status = await get_database_status()
        db_pool_info = await db_manager.get_pool_status()
        
        return {
            "api": {
                "status": "running",
                "version": "1.0.0",
                "environment": "production"  # This could be configurable
            },
            "database": {
                "status": db_status,
                "pool": db_pool_info
            },
            "timestamp": db_manager.get_current_timestamp()
        }
        
    except Exception as e:
        logger.error(f"Status check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to retrieve system status"
        )


if __name__ == "__main__":
    import uvicorn
    
    # Development server configuration
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )