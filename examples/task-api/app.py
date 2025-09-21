# Standard library imports
import logging
from contextlib import asynccontextmanager

# Third-party imports
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Local application imports
from api.tasks import router as tasks_router
from api.users import router as users_router
from core.database import init_database, close_database, check_database_connection
from core.auth import JWTAuthenticationMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for handling startup and shutdown events.
    
    Args:
        app: FastAPI application instance
        
    Yields:
        None: Control back to the application during its lifetime
    """
    # Startup
    logger.info("Starting Task Management API...")
    
    try:
        # Initialize database connection pool and tables
        await init_database()
        logger.info("Database initialized successfully")
        
        # Verify database connection
        is_connected = await check_database_connection()
        if not is_connected:
            raise Exception("Failed to establish database connection")
            
        logger.info("Database connection verified")
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise RuntimeError(f"Database initialization failed: {str(e)}")
    
    logger.info("Task Management API startup completed successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Task Management API...")
    
    try:
        await close_database()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error during database cleanup: {str(e)}")
    
    logger.info("Task Management API shutdown completed")


def create_application() -> FastAPI:
    """
    Application factory function that creates and configures the FastAPI instance.
    
    Returns:
        FastAPI: Configured FastAPI application instance
    """
    # Create FastAPI instance with lifespan manager
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
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )
    
    # Add JWT authentication middleware for protected routes
    app.add_middleware(JWTAuthenticationMiddleware)
    
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
    
    return app


# Create application instance
app = create_application()


@app.get(
    "/health",
    status_code=status.HTTP_200_OK,
    response_model=dict,
    tags=["health"]
)
async def health_check() -> JSONResponse:
    """
    Health check endpoint to verify API and database connectivity.
    
    Returns:
        JSONResponse: Health status including database connectivity
        
    Raises:
        HTTPException: If database connection fails
    """
    try:
        # Check database connection
        is_db_connected = await check_database_connection()
        
        if not is_db_connected:
            logger.error("Health check failed: Database connection unavailable")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection unavailable"
            )
        
        health_status = {
            "status": "healthy",
            "database": "connected",
            "api_version": "1.0.0"
        }
        
        logger.info("Health check passed successfully")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=health_status
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Health check failed with unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Health check failed: {str(e)}"
        )


@app.get("/", tags=["root"])
async def root() -> dict:
    """
    Root endpoint providing basic API information.
    
    Returns:
        dict: Basic API information and available endpoints
    """
    return {
        "message": "Welcome to Task Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "api_endpoints": {
            "tasks": "/api/tasks",
            "users": "/api/users"
        }
    }


# Global exception handler for unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception) -> JSONResponse:
    """
    Global exception handler for unhandled exceptions.
    
    Args:
        request: The request that caused the exception
        exc: The exception that was raised
        
    Returns:
        JSONResponse: Error response with appropriate status code
    """
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error occurred",
            "error_type": type(exc).__name__
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    # Run the application with uvicorn for development
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )