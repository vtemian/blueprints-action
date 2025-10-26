# main.py
"""
FastAPI application entry point module.

This module serves as the main entry point for the FastAPI application,
configuring and starting the uvicorn ASGI server with development settings.
"""

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )