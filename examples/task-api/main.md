# main

FastAPI application entry point.

Dependencies: uvicorn, @app

Requirements:
- Import app from @app module
- Run uvicorn server on port 8000
- Enable reload in development mode
- Configure host as 0.0.0.0 for container compatibility

Implementation:
```python
if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
```