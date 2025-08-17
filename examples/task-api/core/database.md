# core.database

Database connection and session management.

Dependencies: sqlalchemy, databases, sqlite

Requirements:

## Configuration
- Use SQLite for development
- Database URL from environment or default to sqlite:///./tasks.db
- Connection pooling configuration
- Async database support

## Components

### Database setup
- Create engine with SQLAlchemy
- Configure declarative base
- Session factory with scoped sessions

### Functions
- get_db(): Dependency for FastAPI routes
- init_db(): Create all tables
- close_db(): Cleanup connections

### Base model
- Common fields: id, created_at, updated_at
- UUID primary keys
- Timestamp management

## Usage pattern
```python
async def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```