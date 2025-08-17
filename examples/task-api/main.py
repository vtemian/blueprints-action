"""
FastAPI Application Entry Point

This module serves as the main entry point for the FastAPI application.
It configures and starts the uvicorn ASGI server with appropriate settings
for both development and production environments.
"""

import os
import sys
import uvicorn


def main() -> None:
    """
    Configure and start the FastAPI application server.
    
    Raises:
        SystemExit: If server fails to start or encounters critical errors.
    """
    try:
        # Get configuration from environment variables with sensible defaults
        host = os.getenv("HOST", "0.0.0.0")  # 0.0.0.0 for Docker compatibility
        port = int(os.getenv("PORT", "8000"))
        reload = os.getenv("RELOAD", "true").lower() == "true"
        log_level = os.getenv("LOG_LEVEL", "info").lower()
        
        # Validate port range
        if not (1 <= port <= 65535):
            raise ValueError(f"Invalid port number: {port}")
        
        print(f"Starting FastAPI server on {host}:{port}")
        print(f"Reload mode: {'enabled' if reload else 'disabled'}")
        
        # Start the uvicorn server
        # Using string reference "app:app" to avoid import issues and circular dependencies
        uvicorn.run(
            "app:app",  # Module:variable reference to FastAPI instance
            host=host,
            port=port,
            reload=reload,
            log_level=log_level,
            access_log=True,
            # Additional production-ready configurations
            loop="auto",  # Automatically choose the best event loop
            http="auto",  # Automatically choose the best HTTP implementation
        )
        
    except ValueError as e:
        print(f"Configuration error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nServer shutdown requested by user")
        sys.exit(0)
    except Exception as e:
        print(f"Failed to start server: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    # Python main guard pattern - prevents execution when module is imported
    main()