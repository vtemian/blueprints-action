# main

FastAPI application entry point and configuration.

Dependencies: fastapi, uvicorn, @api.tasks, @api.categories, @api.stats, @services.database, @middleware.cors, @middleware.logging

Requirements:
- FastAPI app initialization:
  - Title: "Task Management API"
  - Version: "1.0.0"
  - Description from docstring
  - Auto-generate OpenAPI docs

- Router registration:
  - Include tasks router at /api/tasks
  - Include categories router at /api/categories  
  - Include stats router at /api/stats
  - Health check endpoint at /health

- Middleware setup:
  - CORS middleware for web clients
  - Request logging middleware
  - Error handling middleware
  - Rate limiting (100 requests/minute)

- Startup events:
  - Initialize database connection
  - Create tables if not exist
  - Log startup information

- Shutdown events:
  - Close database connections
  - Cleanup resources

- Health check endpoint:
  - GET /health
  - Check database connectivity
  - Return status and version

- Run configuration:
  - Host: 0.0.0.0
  - Port: 8000 (from env var PORT)
  - Reload in development
  - Access log enabled