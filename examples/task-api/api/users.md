# api.users

User management and authentication endpoints.

Dependencies: fastapi, @models.user, @core.auth, @core.database, pydantic

Requirements:

## Endpoints

### POST /api/users/register
- Register new user account
- Required: email, password, name
- Hash password before storing
- Return user info and JWT token
- Check email uniqueness

### POST /api/users/login
- Authenticate user
- Required: email, password
- Verify password hash
- Return JWT token and user info
- Track last login

### GET /api/users/me
- Get current user profile
- Requires authentication
- Return user info without password

### PUT /api/users/me
- Update current user profile
- Allowed: name, email
- Require password confirmation for email change
- Return updated user

### POST /api/users/change-password
- Change user password
- Required: current_password, new_password
- Verify current password
- Hash and save new password

## Validation
- Email format validation
- Password minimum 8 characters
- Unique email constraint