// Package tasks provides RESTful API endpoints for task management
package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq" // PostgreSQL driver
)

// Task represents a task entity
type Task struct {
	ID          int64     `json:"id" db:"id"`
	UserID      int64     `json:"user_id" db:"user_id"`
	Title       string    `json:"title" db:"title"`
	Description string    `json:"description" db:"description"`
	Status      string    `json:"status" db:"status"`
	Priority    string    `json:"priority" db:"priority"`
	DueDate     *time.Time `json:"due_date,omitempty" db:"due_date"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
	DeletedAt   *time.Time `json:"-" db:"deleted_at"`
}

// CreateTaskRequest represents the request payload for creating a task
type CreateTaskRequest struct {
	Title       string     `json:"title" validate:"required,min=1,max=255"`
	Description string     `json:"description" validate:"required,min=1,max=1000"`
	Priority    string     `json:"priority" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

// UpdateTaskRequest represents the request payload for updating a task
type UpdateTaskRequest struct {
	Title       *string    `json:"title,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string    `json:"description,omitempty" validate:"omitempty,min=1,max=1000"`
	Status      *string    `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
	Priority    *string    `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

// TaskListResponse represents the response for listing tasks
type TaskListResponse struct {
	Tasks      []Task     `json:"tasks"`
	Pagination Pagination `json:"pagination"`
}

// Pagination represents pagination metadata
type Pagination struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// User represents the authenticated user context
type User struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
}

// Custom error types
type (
	// TaskNotFoundError represents a task not found error
	TaskNotFoundError struct {
		TaskID int64
	}

	// UnauthorizedError represents an unauthorized access error
	UnauthorizedError struct {
		Message string
	}

	// ValidationError represents a validation error
	ValidationError struct {
		Field   string
		Message string
	}

	// DatabaseError represents a database operation error
	DatabaseError struct {
		Operation string
		Err       error
	}
)

func (e TaskNotFoundError) Error() string {
	return fmt.Sprintf("task with ID %d not found", e.TaskID)
}

func (e UnauthorizedError) Error() string {
	return e.Message
}

func (e ValidationError) Error() string {
	return fmt.Sprintf("validation error for field '%s': %s", e.Field, e.Message)
}

func (e DatabaseError) Error() string {
	return fmt.Sprintf("database error during %s: %v", e.Operation, e.Err)
}

// ErrorResponse represents a standardized error response
type ErrorResponse struct {
	Error   string                 `json:"error"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
}

// TaskHandler handles task-related HTTP requests
type TaskHandler struct {
	db     *sql.DB
	logger *slog.Logger
}

// NewTaskHandler creates a new TaskHandler instance
func NewTaskHandler(db *sql.DB, logger *slog.Logger) *TaskHandler {
	return &TaskHandler{
		db:     db,
		logger: logger,
	}
}

// RegisterRoutes registers all task-related routes
func (h *TaskHandler) RegisterRoutes(r *mux.Router) {
	// Apply authentication middleware to all routes
	taskRouter := r.PathPrefix("/api/tasks").Subrouter()
	taskRouter.Use(h.authenticationMiddleware)

	taskRouter.HandleFunc("", h.listTasks).Methods("GET")
	taskRouter.HandleFunc("", h.createTask).Methods("POST")
	taskRouter.HandleFunc("/{task_id:[0-9]+}", h.getTask).Methods("GET")
	taskRouter.HandleFunc("/{task_id:[0-9]+}", h.updateTask).Methods("PUT")
	taskRouter.HandleFunc("/{task_id:[0-9]+}", h.deleteTask).Methods("DELETE")
	taskRouter.HandleFunc("/{task_id:[0-9]+}/complete", h.completeTask).Methods("POST")
}

// authenticationMiddleware validates the user authentication
func (h *TaskHandler) authenticationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract user from JWT token or session
		// This is a simplified example - in production, you'd validate JWT tokens
		userID := r.Header.Get("X-User-ID")
		if userID == "" {
			h.writeErrorResponse(w, http.StatusUnauthorized, UnauthorizedError{
				Message: "authentication required",
			})
			return
		}

		// Convert userID to int64
		uid, err := strconv.ParseInt(userID, 10, 64)
		if err != nil {
			h.writeErrorResponse(w, http.StatusUnauthorized, UnauthorizedError{
				Message: "invalid user ID",
			})
			return
		}

		// Add user to request context
		user := &User{ID: uid}
		ctx := context.WithValue(r.Context(), "user", user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// getUserFromContext extracts the authenticated user from request context
func getUserFromContext(ctx context.Context) (*User, error) {
	user, ok := ctx.Value("user").(*User)
	if !ok {
		return nil, UnauthorizedError{Message: "user not found in context"}
	}
	return user, nil
}

// listTasks handles GET /api/tasks
func (h *TaskHandler) listTasks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, err := getUserFromContext(ctx)
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	// Parse query parameters
	query := r.URL.Query()
	
	// Pagination
	page, _ := strconv.Atoi(query.Get("page"))
	if page < 1 {
		page = 1
	}
	
	limit, _ := strconv.Atoi(query.Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	
	offset := (page - 1) * limit

	// Filters
	status := query.Get("status")
	priority := query.Get("priority")
	dueBefore := query.Get("due_before")
	dueAfter := query.Get("due_after")

	// Build SQL query
	baseQuery := `
		SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
		FROM tasks 
		WHERE user_id = $1 AND deleted_at IS NULL`
	
	countQuery := `
		SELECT COUNT(*) 
		FROM tasks 
		WHERE user_id = $1 AND deleted_at IS NULL`

	args := []interface{}{user.ID}
	argIndex := 2

	// Add filters
	if status != "" {
		baseQuery += fmt.Sprintf(" AND status = $%d", argIndex)
		countQuery += fmt.Sprintf(" AND status = $%d", argIndex)
		args = append(args, status)
		argIndex++
	}

	if priority != "" {
		baseQuery += fmt.Sprintf(" AND priority = $%d", argIndex)
		countQuery += fmt.Sprintf(" AND priority = $%d", argIndex)
		args = append(args, priority)
		argIndex++
	}

	if dueBefore != "" {
		if dueBeforeTime, err := time.Parse(time.RFC3339, dueBefore); err == nil {
			baseQuery += fmt.Sprintf(" AND due_date <= $%d", argIndex)
			countQuery += fmt.Sprintf(" AND due_date <= $%d", argIndex)
			args = append(args, dueBeforeTime)
			argIndex++
		}
	}

	if dueAfter != "" {
		if dueAfterTime, err := time.Parse(time.RFC3339, dueAfter); err == nil {
			baseQuery += fmt.Sprintf(" AND due_date >= $%d", argIndex)
			countQuery += fmt.Sprintf(" AND due_date >= $%d", argIndex)
			args = append(args, dueAfterTime)
			argIndex++
		}
	}

	// Get total count
	var total int64
	err = h.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		h.logger.Error("failed to count tasks", "error", err, "user_id", user.ID)
		h.writeErrorResponse(w, http.StatusInternalServerError, DatabaseError{
			Operation: "count tasks",
			Err:       err,
		})
		return
	}

	// Add pagination to query
	baseQuery += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, limit, offset)

	// Execute query
	rows, err := h.db.QueryContext(ctx, baseQuery, args...)
	if err != nil {
		h.logger.Error("failed to query tasks", "error", err, "user_id", user.ID)
		h.writeErrorResponse(w, http.StatusInternalServerError, DatabaseError{
			Operation: "query tasks",
			Err:       err,
		})
		return
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var task Task
		err := rows.Scan(
			&task.ID, &task.UserID, &task.Title, &task.Description,
			&task.Status, &task.Priority, &task.DueDate,
			&task.CreatedAt, &task.UpdatedAt,
		)
		if err != nil {
			h.logger.Error("failed to scan task", "error", err)
			h.writeErrorResponse(w, http.StatusInternalServerError, DatabaseError{
				Operation: "scan task",
				Err:       err,
			})
			return
		}
		tasks = append(tasks, task)
	}

	if err = rows.Err(); err != nil {
		h.logger.Error("error iterating tasks", "error", err)
		h.writeErrorResponse(w, http.StatusInternalServerError, DatabaseError{
			Operation: "iterate tasks",
			Err:       err,
		})
		return
	}

	// Calculate pagination metadata
	totalPages := int((total + int64(limit) - 1) / int64(limit))

	response := TaskListResponse{
		Tasks: tasks,
		Pagination: Pagination{
			Page:       page,
			Limit:      limit,
			Total:      total,
			TotalPages: totalPages,
		},
	}

	h.writeJSONResponse(w, http.StatusOK, response)
}

// getTask handles GET /api/tasks/{task_id}
func (h *TaskHandler) getTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, err := getUserFromContext(ctx)
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	taskID, err := h.extractTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	task, err := h.getTaskByID(ctx, taskID, user.ID)
	if err != nil {
		switch err.(type) {
		case TaskNotFoundError:
			h.writeErrorResponse(w, http.StatusNotFound, err)
		case UnauthorizedError:
			h.writeErrorResponse(w, http.StatusForbidden, err)
		default:
			h.writeErrorResponse(w, http.StatusInternalServerError, err)
		}
		return
	}

	h.writeJSONResponse(w, http.StatusOK, task)
}

// createTask handles POST /api/tasks
func (h *TaskHandler) createTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, err := getUserFromContext(ctx)
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	var req CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, ValidationError{
			Field:   "body",
			Message: "invalid JSON format",
		})
		return
	}

	// Validate request
	if err := h.validateCreateTaskRequest(&req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	// Set default values
	status := "pending"
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	// Create task
	query := `
		INSERT INTO tasks (user_id, title, description, status, priority, due_date, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at`

	now := time.Now()
	var task Task
	err = h.db.QueryRowContext(ctx, query,
		user.ID, req.Title, req.Description, status, priority, req.DueDate, now, now,
	).Scan(&task.ID, &task.CreatedAt, &task.UpdatedAt)

	if err != nil {
		h.logger.Error("failed to create task", "error", err, "user_id", user.ID)
		h.writeErrorResponse(w, http.StatusInternalServerError, DatabaseError{
			Operation: "create task",
			Err:       err,
		})
		return
	}

	// Populate response
	task.UserID = user.ID
	task.Title = req.Title
	task.Description = req.Description
	task.Status = status
	task.Priority = priority
	task.DueDate = req.DueDate

	h.logger.Info("task created", "task_id", task.ID, "user_id", user.ID)
	h.writeJSONResponse(w, http.StatusCreated, task)
}

// updateTask handles PUT /api/tasks/{task_i