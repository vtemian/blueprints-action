"""
FastAPI Application Entry Point

This module serves as the main entry point for the FastAPI application.
It imports the FastAPI app instance and configures the uvicorn ASGI server
for development with hot-reloading capabilities.

Usage:
    python main.py

The server will start on http://0.0.0.0:8000 with auto-reload enabled.
"""

import uvicorn

from app import app


if __name__ == "__main__":
    # Run the FastAPI application using uvicorn ASGI server
    # Parameters:
    # - "app:app": String reference to the app instance (module:variable)
    #   Using string reference instead of direct object enables proper reload functionality
    # - host="0.0.0.0": Bind to all network interfaces for container/network accessibility
    # - port=8000: Standard port for FastAPI development
    # - reload=True: Enable hot-reloading for development (watches file changes)
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )