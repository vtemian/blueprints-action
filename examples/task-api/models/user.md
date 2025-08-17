# models.user

User model definition.

Dependencies: sqlalchemy, @core.database, datetime, uuid

Requirements:

## User Model
Fields:
- id: UUID primary key
- email: String(255), unique, required
- password_hash: String(255), required
- name: String(100), required
- is_active: Boolean, default True
- last_login: DateTime, nullable
- created_at: DateTime, auto
- updated_at: DateTime, auto-update

## Relationships
- Has many Tasks (one-to-many)

## Methods
- set_password(password): Hash and store password
- check_password(password): Verify password
- to_dict(): Serialize without password

## Database
- Table name: "users"
- Indexes: email (unique)
- Constraints: email uniqueness