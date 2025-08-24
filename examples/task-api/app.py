"""
FastAPI Task Management API - Main Application Module

This module serves as the main entry point for the Task Management API,
providing comprehensive routing, middleware configuration, and lifecycle management.
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

# Configure logging for production
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("app.log")
    ]
)

logger = logging.getLogger(__name__)

# Import validation and error handling
try:
    from api.tasks import router as tasks_router
    logger.info("Successfully imported tasks router")
except ImportError as e:
    logger.error(f"Failed to import tasks router: {e}")
    tasks_router = None

try:
    from api.users import router as users_router
    logger.info("Successfully imported users router")
except ImportError as e:
    logger.error(f"Failed to import users router: {e}")
    users_router = None

try:
    from core.database import engine, create_tables, get_db_status
    logger.info("Successfully imported database components")
except ImportError as e:
    logger.error(f"Failed to import database components: {e}")
    engine = None
    create_tables = None
    get_db_status = None

try:
    from core.auth import JWTAuthenticationMiddleware
    logger.info("Successfully imported JWT authentication middleware")
except ImportError as e:
    logger.error(f"Failed to import JWT authentication middleware: {e}")
    JWTAuthenticationMiddleware = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Async context manager for handling application lifespan events.
    
    Manages database initialization on startup and cleanup on shutdown.
    """
    # Startup events
    logger.info("Starting Task Management API...")
    
    try:
        # Initialize database tables and connection pool
        if create_tables is not None and engine is not None:
            logger.info("Initializing database tables...")
            await create_tables()
            logger.info("Database tables initialized successfully")
            
            # Test database connection
            db_status = await get_db_status()
            if not db_status.get("connected", False):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Database connection failed during startup"
                )
            logger.info("Database connection verified successfully")
        else:
            logger.warning("Database components not available - running without database")
            
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database initialization failed: {str(e)}"
        )
    
    logger.info("Task Management API startup completed successfully")
    
    yield
    
    # Shutdown events
    logger.info("Shutting down Task Management API...")
    
    try:
        # Close database connections and cleanup resources
        if engine is not None:
            logger.info("Closing database connections...")
            await engine.dispose()
            logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
    
    logger.info("Task Management API shutdown completed")


# Create FastAPI application instance
app = FastAPI(
    title="Task Management API",
    version="1.0.0",
    description="A comprehensive task management system with user authentication and CRUD operations",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS middleware with security considerations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Specific origins for security
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "User-Agent",
        "DNT",
        "Cache-Control",
        "X-Mx-ReqToken",
        "Keep-Alive",
        "X-Requested-With",
        "If-Modified-Since",
    ],
    expose_headers=["*"],
    max_age=86400,  # 24 hours
)

# Add trusted host middleware for additional security
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "*.localhost"]
)

# Add JWT authentication middleware if available
if JWTAuthenticationMiddleware is not None:
    app.add_middleware(JWTAuthenticationMiddleware)
    logger.info("JWT authentication middleware configured")
else:
    logger.warning("JWT authentication middleware not available")


# Health check endpoint with comprehensive database connectivity test
@app.get(
    "/health",
    tags=["Health"],
    summary="Health Check",
    description="Comprehensive health check including database connectivity verification"
)
async def health_check() -> Dict[str, Any]:
    """
    Perform comprehensive health check including database connectivity.
    
    Returns:
        Dict containing health status, database connection info, and system details
    """
    health_status = {
        "status": "healthy",
        "service": "Task Management API",
        "version": "1.0.0",
        "database": {
            "connected": False,
            "status": "unknown",
            "details": {}
        }
    }
    
    # Test database connectivity
    try:
        if get_db_status is not None:
            db_status = await get_db_status()
            health_status["database"] = db_status
            
            if not db_status.get("connected", False):
                health_status["status"] = "degraded"
                logger.warning("Health check: Database connection issues detected")
        else:
            health_status["database"]["status"] = "not_configured"
            health_status["status"] = "degraded"
            logger.warning("Health check: Database status function not available")
            
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["database"]["status"] = "error"
        health_status["database"]["error"] = str(e)
        logger.error(f"Health check failed: {e}")
        
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=health_status
        )
    
    # Return appropriate status code based on health
    status_code = status.HTTP_200_OK
    if health_status["status"] == "degraded":
        status_code = status.HTTP_206_PARTIAL_CONTENT
    elif health_status["status"] == "unhealthy":
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    
    return JSONResponse(
        status_code=status_code,
        content=health_status
    )


# Include API routers with proper organization
if tasks_router is not None:
    app.include_router(
        tasks_router,
        prefix="/api",
        tags=["Tasks"],
        responses={
            404: {"description": "Task not found"},
            422: {"description": "Validation error"},
            500: {"description": "Internal server error"}
        }
    )
    logger.info("Tasks router included successfully")
else:
    logger.error("Tasks router not available - tasks endpoints will not be accessible")

if users_router is not None:
    app.include_router(
        users_router,
        prefix="/api",
        tags=["Users"],
        responses={
            404: {"description": "User not found"},
            422: {"description": "Validation error"},
            500: {"description": "Internal server error"}
        }
    )
    logger.info("Users router included successfully")
else:
    logger.error("Users router not available - users endpoints will not be accessible")


# Global exception handler for unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """
    Global exception handler for unhandled exceptions.
    
    Logs the error and returns a generic error response to avoid exposing
    sensitive information in production.
    """
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "status_code": 500,
            "error_type": "internal_server_error"
        }
    )


# Root endpoint
@app.get(
    "/",
    tags=["Root"],
    summary="API Root",
    description="Root endpoint providing API information and available endpoints"
)
async def root() -> Dict[str, Any]:
    """
    Root endpoint providing basic API information.
    
    Returns:
        Dict containing API information and available endpoints
    """
    return {
        "message": "Welcome to Task Management API",
        "version": "1.0.0",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "health_check": "/health",
        "api_prefix": "/api",
        "available_endpoints": {
            "tasks": "/api/tasks" if tasks_router is not None else "unavailable",
            "users": "/api/users" if users_router is not None else "unavailable"
        }
    }


# Request logging middleware
@app.middleware("http")
async def log_requests(request, call_next):
    """
    Middleware for logging HTTP requests and responses.
    
    Logs request method, URL, and response status for monitoring purposes.
    """
    start_time = time.time()
    
    # Log request
    logger.info(f"Request: {request.method} {request.url}")
    
    # Process request
    response = await call_next(request)
    
    # Log response
    process_time = time.time() - start_time
    logger.info(
        f"Response: {response.status_code} - "
        f"Process time: {process_time:.4f}s"
    )
    
    return response


if __name__ == "__main__":
    import uvicorn
    import time
    
    logger.info("Starting Task Management API server...")
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # Set to False for production
        log_level="info",
        access_log=True,
        server_header=False,  # Security: hide server header
        date_header=False     # Security: hide date header
    )