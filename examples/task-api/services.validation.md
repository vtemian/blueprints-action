# services.validation

Input validation and business logic validation service.

Dependencies: pydantic, datetime, re, typing

Requirements:
- Task validation:
  - Title: required, 1-200 characters, strip whitespace
  - Description: optional, max 2000 characters
  - Priority: must be valid enum value
  - Due date: must be future date when creating
  - Status transitions: enforce valid state machine
  - Category ID: verify exists in database

- Category validation:
  - Name: required, 1-50 characters, alphanumeric + spaces
  - Color: valid hex format (#RRGGBB)
  - Name uniqueness: case-insensitive check

- Common validators:
  - sanitize_string(text): Remove dangerous characters
  - validate_hex_color(color): Check valid hex format
  - validate_future_date(date): Ensure date is in future
  - validate_enum(value, enum_class): Check valid enum value

- Validation schemas using Pydantic:
  - TaskCreateSchema
  - TaskUpdateSchema
  - CategoryCreateSchema
  - CategoryUpdateSchema
  - PaginationSchema

Error Messages:
- Provide clear, user-friendly error messages
- Include field names in errors
- Return all validation errors at once (not one at a time)