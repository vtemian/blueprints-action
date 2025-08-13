# core.auth

Authentication and authorization utilities.

Dependencies: jose, passlib, fastapi.security, datetime, @models.user

Requirements:

## JWT Token Management
- Generate access tokens with expiration
- Secret key from environment variable
- Algorithm: HS256
- Token expiration: 24 hours

## Password Handling
- Hash passwords using bcrypt
- Verify password against hash
- Salt rounds: 12

## Functions
- create_access_token(data): Generate JWT
- verify_token(token): Decode and validate JWT
- get_password_hash(password): Hash password
- verify_password(plain, hashed): Check password
- get_current_user(token): Extract user from JWT

## FastAPI Dependencies
- oauth2_scheme: OAuth2PasswordBearer
- get_current_user: Dependency for protected routes
- get_current_active_user: Verify user is active

## Security Headers
- Token type: Bearer
- Header name: Authorization