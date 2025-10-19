"""
FastAPI Application Entry Point

This module serves as the main entry point for the FastAPI application.
It configures and starts the uvicorn ASGI server with development-friendly
settings while maintaining container compatibility.
"""

import uvicorn
from app import app


if __name__ == "__main__":
    # Configure uvicorn server for development with container compatibility
    uvicorn.run(
        "app:app",          # String reference to app instance for hot-reloading
        host="0.0.0.0",     # Bind to all interfaces for container networking
        port=8000,          # Standard web application port
        reload=True         # Enable hot-reloading for development
    )