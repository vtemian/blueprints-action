"""
FastAPI Application Configuration and Setup Module

This module serves as the main entry point for the Task Management API,
providing production-ready configuration, middleware setup, and error handling.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
import uvicorn

# Relative imports for API routes and core functionality
from api import tasks, users
from core import database, auth

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Environment configuration with defaults
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./task_management.db")
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Security scheme for JWT authentication
security = HTTPBearer()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager handling startup and shutdown events.
    
    Manages database connections and performs cleanup operations.
    """
    # Startup
    logger.info("Starting Task Management API...")
    try:
        # Initialize database connection and create tables
        await database.initialize_database(DATABASE_URL)
        await database.create_tables()
        logger.info("Database initialized successfully")
        
        # Initialize authentication system
        auth.initialize_auth(SECRET_KEY)
        logger.info("Authentication system initialized")
        
    except Exception as e:
        logger.error(f"Failed to initialize application: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Task Management API...")
    try:
        await database.close_connections()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")


def create_application() -> FastAPI:
    """
    Create and configure the FastAPI application instance.
    
    Returns:
        FastAPI: Configured FastAPI application instance
    """
    # Determine documentation URLs based on environment
    docs_url = "/docs" if ENVIRONMENT == "development" else None
    redoc_url = "/redoc" if ENVIRONMENT == "development" else None
    openapi_url = "/openapi.json" if ENVIRONMENT != "production" else None
    
    # Create FastAPI instance with production-ready configuration
    application = FastAPI(
        title="Task Management API",
        version="1.0.0",
        description="A comprehensive task management system with user authentication",
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
        lifespan=lifespan
    )
    
    return application


# Create the FastAPI application
app = create_application()


# Custom middleware for request/response logging
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """
    Log incoming requests and outgoing responses for monitoring and debugging.
    """
    start_time = time.time()
    
    # Log request
    logger.info(f"Request: {request.method} {request.url}")
    
    try:
        response = await call_next(request)
        
        # Calculate processing time
        process_time = time.time() - start_time
        
        # Log response
        logger.info(
            f"Response: {response.status_code} - "
            f"Processing time: {process_time:.4f}s"
        )
        
        # Add processing time header
        response.headers["X-Process-Time"] = str(process_time)
        
        return response
        
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(f"Request failed: {e} - Processing time: {process_time:.4f}s")
        raise


# Custom authentication middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Handle JWT authentication for protected routes.
    
    Validates JWT tokens and adds user information to request state.
    """
    # Skip authentication for public endpoints
    public_paths = ["/health", "/docs", "/redoc", "/openapi.json", "/api/users/login", "/api/users/register"]
    
    if request.url.path in public_paths or request.method == "OPTIONS":
        return await call_next(request)
    
    # Check for Authorization header
    authorization = request.headers.get("Authorization")
    
    if not authorization or not authorization.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={"detail": "Missing or invalid authorization header"}
        )
    
    try:
        # Extract and validate token
        token = authorization.split(" ")[1]
        user_data = await auth.validate_token(token)
        
        # Add user information to request state
        request.state.user = user_data
        
        return await call_next(request)
        
    except auth.InvalidTokenError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or expired token"}
        )
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication failed"}
        )


# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
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
    expose_headers=["X-Process-Time"],
)

# Add trusted host middleware for production security
if ENVIRONMENT == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=os.getenv("ALLOWED_HOSTS", "localhost").split(",")
    )


# Include API routers with prefix
app.include_router(
    tasks.router,
    prefix="/api",
    tags=["tasks"],
    dependencies=[Depends(auth.get_current_user)]
)

app.include_router(
    users.router,
    prefix="/api",
    tags=["users"]
)


# Health check endpoint
@app.get("/health", tags=["health"])
async def health_check() -> Dict[str, str]:
    """
    Health check endpoint to verify API and database connectivity.
    
    Returns:
        Dict[str, str]: Health status including database connectivity
    """
    try:
        # Check database connectivity
        db_status = await database.check_connection()
        
        return {
            "status": "healthy",
            "database": "connected" if db_status else "disconnected",
            "version": "1.0.0",
            "environment": ENVIRONMENT
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "version": "1.0.0",
            "environment": ENVIRONMENT,
            "error": str(e)
        }


# Global exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with proper logging and response format."""
    logger.warning(f"HTTP {exc.status_code}: {exc.detail} - Path: {request.url.path}")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "status_code": exc.status_code,
            "path": request.url.path
        }
    )


@app.exception_handler(500)
async def internal_server_error_handler(request: Request, exc: Exception):
    """Handle internal server errors with proper logging."""
    logger.error(f"Internal server error: {exc} - Path: {request.url.path}")
    
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "status_code": 500,
            "path": request.url.path
        }
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Handle 404 errors with custom response."""
    logger.info(f"404 Not Found: {request.url.path}")
    
    return JSONResponse(
        status_code=404,
        content={
            "detail": "The requested resource was not found",
            "status_code": 404,
            "path": request.url.path
        }
    )


# Root endpoint
@app.get("/", tags=["root"])
async def root() -> Dict[str, Any]:
    """
    Root endpoint providing API information.
    
    Returns:
        Dict[str, Any]: API information and available endpoints
    """
    return {
        "message": "Welcome to Task Management API",
        "version": "1.0.0",
        "docs_url": "/docs" if ENVIRONMENT == "development" else "Documentation disabled in production",
        "health_check": "/health",
        "api_prefix": "/api"
    }


# Configuration validation
def validate_configuration() -> None:
    """Validate critical configuration parameters."""
    if SECRET_KEY == "your-secret-key-change-in-production" and ENVIRONMENT == "production":
        raise ValueError("SECRET_KEY must be changed in production environment")
    
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL must be configured")
    
    logger.info("Configuration validation passed")


# Application entry point
if __name__ == "__main__":
    import time
    
    # Validate configuration before starting
    validate_configuration()
    
    # Configure uvicorn logging
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["default"]["fmt"] = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    log_config["formatters"]["access"]["fmt"] = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Run the application
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=ENVIRONMENT == "development",
        log_config=log_config,
        access_log=True
    )