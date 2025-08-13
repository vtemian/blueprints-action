# app

FastAPI application configuration and setup.

Dependencies: fastapi, @api.tasks, @api.users, @core.database, @core.auth

Requirements:
- Create FastAPI app instance with title and version
- Include routers from api modules
- Setup CORS middleware for web clients
- Initialize database on startup
- Configure authentication middleware

Application setup:
- Title: "Task Management API"
- Version: "1.0.0"
- Include /api/tasks router
- Include /api/users router
- Add health check endpoint at /health

Middleware configuration:
- CORS: Allow localhost:3000 for development
- Authentication: JWT validation for protected routes

Startup events:
- Create database tables
- Initialize connection pool

Health check:
- Return status: "healthy"
- Include database connection status