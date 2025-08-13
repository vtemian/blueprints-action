# middleware.logging

Request/response logging middleware.

Dependencies: logging, time, json

Requirements:
- Log all requests with:
  - Method and path
  - Query parameters
  - Request ID (generate UUID)
  - Client IP address
  - Processing time in ms
  - Response status code

- Log format:
  - JSON format for production
  - Human-readable for development
  - Include timestamp

- Log levels:
  - INFO for successful requests (2xx, 3xx)
  - WARNING for client errors (4xx)
  - ERROR for server errors (5xx)

- Performance:
  - Minimal overhead (<1ms)
  - Async logging to not block requests
  - Rotate logs daily, keep 7 days