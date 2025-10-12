"""
FastAPI Application Entry Point

This module serves as the main entry point for the FastAPI application.
It imports the FastAPI app instance and runs it using uvicorn ASGI server
with development-friendly configuration.

Usage:
    python main.py

The server will start on http://0.0.0.0:8000 with auto-reload enabled
for development purposes.
"""

import sys
from typing import NoReturn

try:
    import uvicorn
except ImportError as e:
    print(f"Error: uvicorn is required but not installed. {e}")
    sys.exit(1)

try:
    from app import app
except ImportError as e:
    print(f"Error: Could not import FastAPI app instance from 'app' module. {e}")
    print("Please ensure 'app.py' exists and contains a FastAPI instance named 'app'.")
    sys.exit(1)


def main() -> NoReturn:
    """
    Main function to start the FastAPI application server.
    
    Configures and runs uvicorn server with the following settings:
    - Host: 0.0.0.0 (accessible from all network interfaces)
    - Port: 8000
    - Reload: True (enables auto-reload on code changes)
    - App: "app:app" (module:instance pattern)
    
    Raises:
        SystemExit: If the server fails to start
    """
    try:
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            access_log=True,
            log_level="info"
        )
    except Exception as e:
        print(f"Error starting server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()