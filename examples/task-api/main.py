"""
FastAPI Application Entry Point

This module serves as the main entry point for the FastAPI application.
It imports the FastAPI app instance and configures the uvicorn server
for development with hot reload capabilities and container-compatible
host binding.

Usage:
    python main.py
"""

import sys
import uvicorn
from typing import NoReturn


def main() -> NoReturn:
    """
    Main function to start the FastAPI application with uvicorn server.
    
    Configures and runs the uvicorn server with:
    - Host: 0.0.0.0 (container-compatible)
    - Port: 8000
    - Reload: enabled for development
    
    Raises:
        SystemExit: On server startup failure or keyboard interrupt
    """
    try:
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=8000,
            reload=True
        )
    except ImportError as e:
        print(f"Error: Failed to import required modules: {e}", file=sys.stderr)
        print("Make sure the 'app' module exists and contains a FastAPI instance named 'app'", file=sys.stderr)
        sys.exit(1)
    except OSError as e:
        print(f"Error: Failed to bind to host/port: {e}", file=sys.stderr)
        print("Port 8000 might already be in use or host binding failed", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nServer shutdown requested by user")
        sys.exit(0)
    except Exception as e:
        print(f"Unexpected error starting server: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()