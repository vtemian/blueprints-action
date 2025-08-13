# Todo List API

Create a RESTful API for a todo list application.

## Requirements

- CRUD operations for todo items
- Each todo should have: id, title, description, completed status, created_at, updated_at
- Input validation
- Error handling with appropriate HTTP status codes
- JSON responses

## Endpoints

- `GET /todos` - List all todos with optional filtering by status
- `GET /todos/:id` - Get a specific todo
- `POST /todos` - Create a new todo
- `PUT /todos/:id` - Update a todo
- `DELETE /todos/:id` - Delete a todo
- `PATCH /todos/:id/toggle` - Toggle completed status
