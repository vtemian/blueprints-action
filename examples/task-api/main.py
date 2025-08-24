"""
FastAPI Application Entry Point

This module serves as the main entry point for the FastAPI application.
It configures and launches the uvicorn ASGI server with appropriate
settings for both development and production environments.

The application is designed to be container-friendly with 0.0.0.0 host
binding and configurable through the uvicorn server settings.
"""

import uvicorn
from typing import Optional


def main() -> None:
    """
    Main function to configure and run the FastAPI application.
    
    Uses uvicorn as the ASGI server with development-friendly settings
    including auto-reload capability and broad host binding for
    container compatibility.
    """
    uvicorn.run(
        "app:app",  # String reference to app instance in app.py module
        host="0.0.0.0",  # Bind to all interfaces for container compatibility
        port=8000,  # Standard HTTP port
        reload=True,  # Enable auto-reload for development
        log_level="info",  # Set appropriate logging level
        access_log=True,  # Enable access logging
    )


if __name__ == "__main__":
    # Entry point guard - only run if script is executed directly
    main()