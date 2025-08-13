# services.database

Database connection and session management.

Dependencies: sqlalchemy, sqlite3, contextlib

Requirements:
- Database configuration:
  - Use SQLite for development (tasks.db)
  - Connection string from environment variable
  - Connection pooling with appropriate limits
  - Auto-create tables on first run

- Session management:
  - get_db(): Context manager for database sessions
  - Automatic rollback on exceptions
  - Proper session cleanup
  - Thread-safe session handling

- Database initialization:
  - create_tables(): Create all tables if not exist
  - seed_data(): Add sample categories and tasks
  - reset_database(): Drop and recreate all tables

- Migration support:
  - Simple version tracking in db_version table
  - apply_migrations(): Run pending migrations
  - Migration scripts in migrations/ directory

- Query helpers:
  - paginate(query, page, limit): Add pagination to query
  - get_or_404(model, id): Get model or raise 404
  - bulk_insert(models): Efficient bulk inserts

- Connection settings:
  - Echo SQL in development mode
  - Connection timeout: 30 seconds
  - Pool size: 5 connections
  - Max overflow: 10 connections