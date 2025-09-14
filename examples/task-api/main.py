"""
FastAPI Application Entry Point

This module serves as the main entry point for the FastAPI application.
It configures and starts the uvicorn ASGI server with appropriate settings
for both development and production environments.

The server is configured to:
- Run on host 0.0.0.0 for Docker container compatibility
- Listen on port 8000
- Enable hot reloading for development
- Handle startup errors gracefully
"""

import sys
from typing import NoReturn

try:
    import uvicorn
except ImportError as e:
    print(f"Error: Failed to import uvicorn. Please install it with 'pip install uvicorn'")
    print(f"Import error details: {e}")
    sys.exit(1)


def start_server() -> NoReturn:
    """
    Start the FastAPI application server using uvicorn.
    
    Uses string reference "app:app" to enable hot reloading functionality.
    The first 'app' refers to the module name, the second 'app' refers to
    the FastAPI instance within that module.
    
    Raises:
        SystemExit: If server fails to start or encounters critical errors
    """
    try:
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=8000,
            reload=True
        )
    except ImportError as e:
        print(f"Error: Failed to import the FastAPI app from 'app' module.")
        print(f"Please ensure the 'app' module exists and contains a FastAPI instance named 'app'.")
        print(f"Import error details: {e}")
        sys.exit(1)
    except OSError as e:
        print(f"Error: Failed to bind to host 0.0.0.0:8000")
        print(f"The port might already be in use or you may lack permissions.")
        print(f"OS error details: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nServer shutdown requested by user (Ctrl+C)")
        sys.exit(0)
    except Exception as e:
        print(f"Error: Unexpected error occurred while starting the server")
        print(f"Error details: {e}")
        sys.exit(1)


if __name__ == "__main__":
    print("Starting FastAPI application server...")
    print("Server will be available at: http://0.0.0.0:8000")
    print("API documentation will be available at: http://0.0.0.0:8000/docs")
    print("Press Ctrl+C to stop the server")
    start_server()