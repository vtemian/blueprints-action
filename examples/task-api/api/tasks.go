package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"your-project/core/auth"
	"your-project/core/database"
	"your-project/models/task"
)

// Handler contains dependencies for task API handlers
type Handler struct {
	db database.DB
}

// NewHandler creates a new task handler instance
func NewHandler(db database.DB) *Handler {
	return &Handler{db: db}
}

// Request/Response structs with JSON tags

// CreateTaskRequest represents the request body for creating a task
type CreateTaskRequest struct {
	Title       string     `json:"title" validate:"required,min=1,max=200"`
	Description string     `json:"description" validate:"required,min=1,max=1000"`
	Priority    string     `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

// UpdateTaskRequest represents the request body for updating a task
type UpdateTaskRequest struct {
	Title       *string    `json:"title,omitempty" validate:"omitempty,min=1,max=200"`
	Description *string    `json:"description,omitempty" validate:"omitempty,min=1,max=1000"`
	Priority    *string    `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Status      *string    `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
}

// TaskResponse represents a task in API responses
type TaskResponse struct {
	ID          int        `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Priority    string     `json:"priority"`
	Status      string     `json:"status"`
	DueDate     *time.Time `json:"due_date"`
	CompletedAt *time.Time `json:"completed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	UserID      int        `json:"user_id"`
}

// TaskListResponse represents paginated task list response
type TaskListResponse struct {
	Tasks      []TaskResponse `json:"tasks"`
	Page       int            `json:"page"`
	Limit      int            `json:"limit"`
	Total      int            `json:"total"`
	TotalPages int            `json:"total_pages"`
}

// ErrorResponse represents API error response format
type ErrorResponse struct {
	Error   string            `json:"error"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

// Custom error types
type TaskError struct {
	Code    string
	Message string
	Details map[string]string
}

func (e TaskError) Error() string {
	return e.Message
}

var (
	ErrTaskNotFound = TaskError{
		Code:    "TASK_NOT_FOUND",
		Message: "Task not found or you don't have permission to access it",
	}
	ErrUnauthorized = TaskError{
		Code:    "UNAUTHORIZED",
		Message: "Authentication required",
	}
	ErrForbidden = TaskError{
		Code:    "FORBIDDEN",
		Message: "You don't have permission to perform this action",
	}
)

// Context keys for request-scoped values
type contextKey string

const (
	userContextKey contextKey = "user"
)

// AuthMiddleware extracts and validates user authentication
func (h *Handler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			h.writeErrorResponse(w, http.StatusUnauthorized, ErrUnauthorized)
			return
		}

		// Parse Bearer token
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			h.writeErrorResponse(w, http.StatusUnauthorized, ErrUnauthorized)
			return
		}

		// Validate token and get user
		user, err := auth.ValidateToken(parts[1])
		if err != nil {
			h.writeErrorResponse(w, http.StatusUnauthorized, ErrUnauthorized)
			return
		}

		// Add user to request context
		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// getUserFromContext extracts user from request context
func getUserFromContext(ctx context.Context) (*auth.User, error) {
	user, ok := ctx.Value(userContextKey).(*auth.User)
	if !ok {
		return nil, ErrUnauthorized
	}
	return user, nil
}

// ListTasks handles GET /api/tasks - List user's tasks with filters and pagination
func (h *Handler) ListTasks(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	// Parse and validate query parameters
	filters, pagination, err := h.parseListTasksParams(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	// Get tasks from database
	tasks, total, err := h.db.GetTasksWithFilters(user.ID, filters, pagination)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to retrieve tasks",
		})
		return
	}

	// Convert to response format
	taskResponses := make([]TaskResponse, len(tasks))
	for i, t := range tasks {
		taskResponses[i] = h.taskToResponse(t)
	}

	// Calculate total pages
	totalPages := (total + pagination.Limit - 1) / pagination.Limit

	response := TaskListResponse{
		Tasks:      taskResponses,
		Page:       pagination.Page,
		Limit:      pagination.Limit,
		Total:      total,
		TotalPages: totalPages,
	}

	h.writeJSONResponse(w, http.StatusOK, response)
}

// GetTask handles GET /api/tasks/{task_id} - Get single task with ownership verification
func (h *Handler) GetTask(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	// Parse task ID from URL
	taskID, err := h.parseTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	// Get task from database
	task, err := h.db.GetTask(taskID)
	if err != nil {
		if database.IsNotFoundError(err) {
			h.writeErrorResponse(w, http.StatusNotFound, ErrTaskNotFound)
			return
		}
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to retrieve task",
		})
		return
	}

	// Verify ownership
	if task.UserID != user.ID {
		h.writeErrorResponse(w, http.StatusNotFound, ErrTaskNotFound)
		return
	}

	response := h.taskToResponse(task)
	h.writeJSONResponse(w, http.StatusOK, response)
}

// CreateTask handles POST /api/tasks - Create new task
func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	// Parse and validate request body
	var req CreateTaskRequest
	if err := h.parseJSONBody(r, &req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	if err := h.validateCreateTaskRequest(req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	// Set default priority if not provided
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	// Create task model
	newTask := task.Task{
		Title:       req.Title,
		Description: req.Description,
		Priority:    priority,
		Status:      "pending",
		DueDate:     req.DueDate,
		UserID:      user.ID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Save to database
	createdTask, err := h.db.CreateTask(newTask)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to create task",
		})
		return
	}

	response := h.taskToResponse(createdTask)
	h.writeJSONResponse(w, http.StatusCreated, response)
}

// UpdateTask handles PUT /api/tasks/{task_id} - Update existing task with ownership verification
func (h *Handler) UpdateTask(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	// Parse task ID from URL
	taskID, err := h.parseTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	// Parse and validate request body
	var req UpdateTaskRequest
	if err := h.parseJSONBody(r, &req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	if err := h.validateUpdateTaskRequest(req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	// Get existing task and verify ownership
	existingTask, err := h.db.GetTask(taskID)
	if err != nil {
		if database.IsNotFoundError(err) {
			h.writeErrorResponse(w, http.StatusNotFound, ErrTaskNotFound)
			return
		}
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to retrieve task",
		})
		return
	}

	if existingTask.UserID != user.ID {
		h.writeErrorResponse(w, http.StatusNotFound, ErrTaskNotFound)
		return
	}

	// Apply updates
	updatedTask := h.applyTaskUpdates(existingTask, req)
	updatedTask.UpdatedAt = time.Now()

	// Save to database
	savedTask, err := h.db.UpdateTask(updatedTask)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to update task",
		})
		return
	}

	response := h.taskToResponse(savedTask)
	h.writeJSONResponse(w, http.StatusOK, response)
}

// DeleteTask handles DELETE /api/tasks/{task_id} - Soft delete with ownership verification
func (h *Handler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	// Parse task ID from URL
	taskID, err := h.parseTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	// Get task and verify ownership
	existingTask, err := h.db.GetTask(taskID)
	if err != nil {
		if database.IsNotFoundError(err) {
			h.writeErrorResponse(w, http.StatusNotFound, ErrTaskNotFound)
			return
		}
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to retrieve task",
		})
		return
	}

	if existingTask.UserID != user.ID {
		h.writeErrorResponse(w, http.StatusNotFound, ErrTaskNotFound)
		return
	}

	// Soft delete task
	err = h.db.SoftDeleteTask(taskID)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to delete task",
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CompleteTask handles POST /api/tasks/{task_id}/complete - Mark task completed with timestamp
func (h *Handler) CompleteTask(w http.ResponseWriter, r *http.Request) {
	user, err := getUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, err)
		return
	}

	// Parse task ID from URL
	taskID, err := h.parseTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, err)
		return
	}

	// Get task and verify ownership
	existingTask, err := h.db.GetTask(taskID)
	if err != nil {
		if database.IsNotFoundError(err) {
			h.writeErrorResponse(w, http.StatusNotFound, ErrTaskNotFound)
			return
		}
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to retrieve task",
		})
		return
	}

	if existingTask.UserID != user.ID {
		h.writeErrorResponse(w, http.StatusNotFound, ErrTaskNotFound)
		return
	}

	// Check if already completed
	if existingTask.Status == "completed" {
		h.writeErrorResponse(w, http.StatusBadRequest, TaskError{
			Code:    "TASK_ALREADY_COMPLETED",
			Message: "Task is already completed",
		})
		return
	}

	// Mark as completed
	now := time.Now()
	existingTask.Status = "completed"
	existingTask.CompletedAt = &now
	existingTask.UpdatedAt = now

	// Save to database
	savedTask, err := h.db.UpdateTask(existingTask)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, TaskError{
			Code:    "DATABASE_ERROR",
			Message: "Failed to complete task",
		})
		return
	}

	response := h.taskToResponse(savedTask)
	h.writeJ