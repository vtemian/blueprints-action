# middleware.cors

CORS middleware configuration for web client access.

Dependencies: fastapi.middleware.cors

Requirements:
- CORS configuration:
  - Allow origins from environment variable (comma-separated)
  - Default to ["http://localhost:3000"] in development
  - Allow credentials for authentication
  - Allow all common HTTP methods
  - Allow all headers

- Security considerations:
  - Never use allow_origins=["*"] in production
  - Validate origin against whitelist
  - Set appropriate max_age for preflight caching