"""
FastAPI Application Configuration Module

This module sets up the main FastAPI application with all necessary middleware,
routers, and event handlers for the Task Management API.
"""

import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

# Import routers
try:
    from api.tasks import router as tasks_router
    from api.users import router as users_router
except ImportError as e:
    logging.error(f"Failed to import API routers: {e}")
    raise ImportError(f"Required API modules not found: {e}")

# Import core modules
try:
    from core.database import init_database, close_database, check_database_connection
    from core.auth import get_current_user, JWTAuthenticationMiddleware
except ImportError as e:
    logging.error(f"Failed to import core modules: {e}")
    raise ImportError(f"Required core modules not found: {e}")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup and shutdown events.
    
    Handles database initialization on startup and cleanup on shutdown.
    """
    # Startup
    logger.info("Starting up Task Management API...")
    try:
        await init_database()
        logger.info("Database initialized successfully")
        
        # Verify database connection
        if not await check_database_connection():
            raise ConnectionError("Database connection verification failed")
            
        logger.info("Application startup completed successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database during startup: {e}")
        raise RuntimeError(f"Application startup failed: {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Task Management API...")
    try:
        await close_database()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")


def create_application() -> FastAPI:
    """
    Application factory function that creates and configures the FastAPI instance.
    
    Returns:
        FastAPI: Configured FastAPI application instance
    """
    # Initialize FastAPI application
    app = FastAPI(
        title="Task Management API",
        version="1.0.0",
        description="A comprehensive task management system with user authentication",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan
    )
    
    # Configure CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"]
    )
    
    # Add trusted host middleware for security
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["localhost", "127.0.0.1", "*.localhost"]
    )
    
    # Add JWT authentication middleware
    try:
        app.add_middleware(JWTAuthenticationMiddleware)
        logger.info("JWT authentication middleware added successfully")
    except Exception as e:
        logger.error(f"Failed to add JWT middleware: {e}")
        raise RuntimeError(f"Authentication middleware setup failed: {e}")
    
    # Include API routers with prefix
    try:
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
        logger.info("API routers included successfully")
    except Exception as e:
        logger.error(f"Failed to include routers: {e}")
        raise RuntimeError(f"Router configuration failed: {e}")
    
    return app


# Create the FastAPI application instance
app = create_application()


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler for consistent error responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.detail,
            "status_code": exc.status_code,
            "path": request.url.path
        }
    )


@app.exception_handler(500)
async def internal_server_error_handler(request: Request, exc: Exception):
    """Handle internal server errors with proper logging."""
    logger.error(f"Internal server error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "message": "Internal server error",
            "status_code": 500,
            "path": request.url.path
        }
    )


@app.get("/health", tags=["health"])
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint to verify API and database connectivity.
    
    Returns:
        Dict[str, Any]: Health status information
        
    Raises:
        HTTPException: If database connection fails
    """
    try:
        # Check database connection
        db_connected = await check_database_connection()
        
        if not db_connected:
            logger.error("Health check failed: Database connection unavailable")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection failed"
            )
        
        logger.info("Health check passed successfully")
        return {
            "status": "healthy",
            "database": "connected",
            "api_version": "1.0.0",
            "timestamp": "2024-01-01T00:00:00Z"  # In production, use actual timestamp
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Health check failed with unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Health check failed: {str(e)}"
        )


@app.get("/", tags=["root"])
async def root() -> Dict[str, str]:
    """
    Root endpoint providing basic API information.
    
    Returns:
        Dict[str, str]: Basic API information
    """
    return {
        "message": "Welcome to Task Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests for monitoring purposes."""
    start_time = time.time()
    
    # Log request
    logger.info(f"Request: {request.method} {request.url.path}")
    
    # Process request
    response = await call_next(request)
    
    # Log response
    process_time = time.time() - start_time
    logger.info(
        f"Response: {response.status_code} - "
        f"Process time: {process_time:.4f}s"
    )
    
    return response


# Import time for request logging
import time


if __name__ == "__main__":
    import uvicorn
    
    logger.info("Starting Task Management API server...")
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )