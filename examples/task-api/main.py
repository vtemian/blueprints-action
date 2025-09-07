"""
FastAPI Application Entry Point

This module serves as the main entry point for the FastAPI application.
It imports the FastAPI app instance and configures the uvicorn server
for development with auto-reload capabilities and container compatibility.
"""

import uvicorn

from app import app


if __name__ == "__main__":
    # Run the FastAPI application using uvicorn server
    # Using string reference "app:app" to avoid circular imports
    # - First "app" refers to the app.py module
    # - Second "app" refers to the FastAPI instance variable
    uvicorn.run(
        "app:app",
        host="0.0.0.0",  # Allow external connections (container-friendly)
        port=8000,       # Standard FastAPI port
        reload=True      # Enable auto-reload for development
    )