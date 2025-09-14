"""
Task Management API - Main Application Module

This module serves as the main entry point for the Task Management API,
configuring FastAPI with all necessary middleware, routers, and database connections.
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import time
import uuid

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('app.log')
    ]
)
logger = logging.getLogger(__name__)

# Import application modules with error handling
try:
    from core.database import (
        create_tables, 
        close_database_connections, 
        get_database_health,
        init_database_pool
    )
    from core.auth import (
        JWTAuthMiddleware,
        get_current_user,
        AuthenticationError
    )
    from api.tasks import router as tasks_router
    from api.users import router as users_router
except ImportError as e:
    logger.error(f"Failed to import required modules: {e}")
    sys.exit(1)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging HTTP requests and responses."""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate request ID for tracing
        request_id = str(uuid.uuid4())
        start_time = time.time()
        
        # Log incoming request
        logger.info(
            f"Request started - ID: {request_id} | "
            f"Method: {request.method} | "
            f"URL: {request.url} | "
            f"Client: {request.client.host if request.client else 'unknown'}"
        )
        
        try:
            # Process request
            response = await call_next(request)
            
            # Calculate processing time
            process_time = time.time() - start_time
            
            # Log response
            logger.info(
                f"Request completed - ID: {request_id} | "
                f"Status: {response.status_code} | "
                f"Duration: {process_time:.3f}s"
            )
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = str(process_time)
            
            return response
            
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(
                f"Request failed - ID: {request_id} | "
                f"Error: {str(e)} | "
                f"Duration: {process_time:.3f}s"
            )
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup and shutdown events.
    """
    # Startup
    logger.info("Starting Task Management API...")
    
    try:
        # Initialize database connection pool
        logger.info("Initializing database connection pool...")
        await init_database_pool()
        
        # Create database tables
        logger.info("Creating database tables...")
        await create_tables()
        
        logger.info("Application startup completed successfully")
        
    except Exception as e:
        logger.error(f"Failed to start application: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Task Management API...")
    
    try:
        # Close database connections
        logger.info("Closing database connections...")
        await close_database_connections()
        
        logger.info("Application shutdown completed successfully")
        
    except Exception as e:
        logger.error(f"Error during application shutdown: {e}")


# Create FastAPI application instance
app = FastAPI(
    title="Task Management API",
    version="1.0.0",
    description="A comprehensive task management system with user authentication and CRUD operations",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)


# Exception Handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle HTTP exceptions with structured error responses."""
    logger.warning(f"HTTP {exc.status_code} error on {request.url}: {exc.detail}")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "path": str(request.url.path)
            }
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle request validation errors."""
    logger.warning(f"Validation error on {request.url}: {exc.errors()}")
    
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": 422,
                "message": "Validation error",
                "details": exc.errors(),
                "path": str(request.url.path)
            }
        }
    )


@app.exception_handler(AuthenticationError)
async def auth_exception_handler(request: Request, exc: AuthenticationError) -> JSONResponse:
    """Handle authentication errors."""
    logger.warning(f"Authentication error on {request.url}: {exc}")
    
    return JSONResponse(
        status_code=401,
        content={
            "error": {
                "code": 401,
                "message": "Authentication failed",
                "path": str(request.url.path)
            }
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    logger.error(f"Unexpected error on {request.url}: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": 500,
                "message": "Internal server error",
                "path": str(request.url.path)
            }
        }
    )


# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add JWT Authentication Middleware
# Skip authentication for public endpoints
public_endpoints = {"/health", "/docs", "/redoc", "/openapi.json", "/api/users/register", "/api/users/login"}

try:
    jwt_middleware = JWTAuthMiddleware(
        skip_paths=public_endpoints
    )
    app.add_middleware(type(jwt_middleware), **jwt_middleware.__dict__)
    logger.info("JWT authentication middleware configured successfully")
except Exception as e:
    logger.error(f"Failed to configure JWT middleware: {e}")
    raise

# Add Request Logging Middleware
app.add_middleware(RequestLoggingMiddleware)

# Include API Routers
try:
    app.include_router(
        tasks_router,
        prefix="/api/tasks",
        tags=["tasks"]
    )
    logger.info("Tasks router included successfully")
    
    app.include_router(
        users_router,
        prefix="/api/users",
        tags=["users"]
    )
    logger.info("Users router included successfully")
    
except Exception as e:
    logger.error(f"Failed to include routers: {e}")
    raise


# Health Check Endpoint
@app.get("/health", tags=["health"])
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint that verifies application and database status.
    
    Returns:
        Dict containing health status and database connectivity information
    """
    try:
        # Test database connectivity
        db_status = await get_database_health()
        
        health_data = {
            "status": "healthy",
            "database": "connected" if db_status else "disconnected",
            "version": "1.0.0",
            "timestamp": time.time()
        }
        
        if not db_status:
            logger.warning("Health check: Database connection failed")
            # Still return 200 but indicate database issue
            health_data["status"] = "degraded"
        
        logger.info(f"Health check completed: {health_data}")
        return health_data
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        
        # Return 503 Service Unavailable for critical failures
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "database": "error",
                "error": str(e),
                "timestamp": time.time()
            }
        )


# Root endpoint
@app.get("/", tags=["root"])
async def root() -> Dict[str, str]:
    """
    Root endpoint providing basic API information.
    """
    return {
        "message": "Welcome to Task Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


# Additional utility endpoints
@app.get("/api/info", tags=["info"])
async def api_info() -> Dict[str, Any]:
    """
    API information endpoint.
    """
    return {
        "name": "Task Management API",
        "version": "1.0.0",
        "description": "A comprehensive task management system",
        "endpoints": {
            "tasks": "/api/tasks",
            "users": "/api/users",
            "health": "/health",
            "docs": "/docs"
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    logger.info("Starting Task Management API server...")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
        access_log=True
    )