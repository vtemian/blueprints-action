import os
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse

# Import routers
from api.tasks import router as tasks_router
from api.users import router as users_router

# Import core modules
from core.database import DatabaseManager, get_database
from core.auth import JWTHandler, get_current_user

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize core components
database_manager = DatabaseManager()
jwt_handler = JWTHandler()
security = HTTPBearer()

# Lifespan context manager for startup and shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up Task Management API...")
    try:
        await database_manager.initialize()
        await database_manager.create_tables()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database initialization failed"
        )
    
    yield
    
    # Shutdown
    logger.info("Shutting down Task Management API...")
    try:
        await database_manager.close_connections()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")

# Create FastAPI application
app = FastAPI(
    title="Task Management API",
    version="1.0.0",
    description="A comprehensive task management system with user authentication",
    lifespan=lifespan
)

# CORS Middleware Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# JWT Authentication Middleware
async def jwt_middleware(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    JWT authentication middleware for protected routes
    """
    try:
        token = credentials.credentials
        payload = jwt_handler.decode_token(token)
        return payload
    except Exception as e:
        logger.error(f"JWT validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# Health Check Endpoint
@app.get("/health", tags=["Health"])
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint that verifies API and database connectivity
    """
    try:
        # Verify database connection
        db_status = await database_manager.check_connection()
        
        if db_status:
            return {
                "status": "healthy",
                "database": "connected",
                "version": "1.0.0"
            }
        else:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "status": "unhealthy",
                    "database": "disconnected",
                    "version": "1.0.0"
                }
            )
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "database": "error",
                "error": str(e),
                "version": "1.0.0"
            }
        )

# Include API Routers
app.include_router(
    tasks_router,
    prefix="/api",
    tags=["Tasks"],
    dependencies=[Depends(jwt_middleware)]  # Protected routes
)

app.include_router(
    users_router,
    prefix="/api",
    tags=["Users"]
)

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """
    Global exception handler for unhandled errors
    """
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "error": str(exc) if os.getenv("DEBUG", "false").lower() == "true" else "An unexpected error occurred"
        }
    )

# Root endpoint
@app.get("/", tags=["Root"])
async def root() -> Dict[str, str]:
    """
    Root endpoint providing API information
    """
    return {
        "message": "Welcome to Task Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

# Dependency providers for dependency injection
def get_jwt_handler() -> JWTHandler:
    """Dependency provider for JWT handler"""
    return jwt_handler

def get_database_manager() -> DatabaseManager:
    """Dependency provider for database manager"""
    return database_manager

# Export app instance for ASGI servers
if __name__ == "__main__":
    import uvicorn
    
    # Development server configuration
    uvicorn.run(
        "app:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("DEBUG", "false").lower() == "true",
        log_level="info"
    )