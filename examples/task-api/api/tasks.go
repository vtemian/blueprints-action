package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// Task represents a task in the system
type Task struct {
	ID          int64      `json:"id" db:"id"`
	UserID      int64      `json:"user_id" db:"user_id"`
	Title       string     `json:"title" db:"title"`
	Description string     `json:"description" db:"description"`
	Priority    string     `json:"priority" db:"priority"`
	Status      string     `json:"status" db:"status"`
	DueDate     *time.Time `json:"due_date,omitempty" db:"due_date"`
	CompletedAt *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt   *time.Time `json:"-" db:"deleted_at"`
}

// CreateTaskRequest represents the request payload for creating a task
type CreateTaskRequest struct {
	Title       string `json:"title" validate:"required,min=1,max=200"`
	Description string `json:"description" validate:"required,min=1,max=1000"`
	Priority    string `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     string `json:"due_date,omitempty" validate:"omitempty,datetime=2006-01-02T15:04:05Z07:00"`
}

// UpdateTaskRequest represents the request payload for updating a task
type UpdateTaskRequest struct {
	Title       *string `json:"title,omitempty" validate:"omitempty,min=1,max=200"`
	Description *string `json:"description,omitempty" validate:"omitempty,min=1,max=1000"`
	Priority    *string `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *string `json:"due_date,omitempty" validate:"omitempty,datetime=2006-01-02T15:04:05Z07:00"`
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

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string            `json:"error"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

// User represents a user in the system
type User struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

// TaskFilter represents filtering options for tasks
type TaskFilter struct {
	Status    string
	Priority  string
	DueBefore *time.Time
	DueAfter  *time.Time
	Page      int
	Limit     int
}

// Custom error types
type AppError struct {
	Code    int
	Message string
	Details map[string]string
}

func (e *AppError) Error() string {
	return e.Message
}

// Database interface for testability
type TaskRepository interface {
	GetTasks(ctx context.Context, userID int64, filter TaskFilter) ([]Task, int64, error)
	GetTaskByID(ctx context.Context, taskID, userID int64) (*Task, error)
	CreateTask(ctx context.Context, task *Task) error
	UpdateTask(ctx context.Context, task *Task) error
	DeleteTask(ctx context.Context, taskID, userID int64) error
	CompleteTask(ctx context.Context, taskID, userID int64) error
}

// AuthService interface for authentication
type AuthService interface {
	ValidateToken(token string) (*User, error)
	GetUserFromContext(ctx context.Context) (*User, error)
}

// Handler contains the dependencies for task handlers
type Handler struct {
	repo        TaskRepository
	authService AuthService
	logger      *log.Logger
}

// NewHandler creates a new task handler
func NewHandler(repo TaskRepository, authService AuthService, logger *log.Logger) *Handler {
	return &Handler{
		repo:        repo,
		authService: authService,
		logger:      logger,
	}
}

// AuthMiddleware validates JWT tokens and sets user context
func (h *Handler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			h.writeErrorResponse(w, &AppError{
				Code:    http.StatusUnauthorized,
				Message: "Authorization header required",
			})
			return
		}

		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			h.writeErrorResponse(w, &AppError{
				Code:    http.StatusUnauthorized,
				Message: "Invalid authorization header format",
			})
			return
		}

		user, err := h.authService.ValidateToken(tokenParts[1])
		if err != nil {
			h.writeErrorResponse(w, &AppError{
				Code:    http.StatusUnauthorized,
				Message: "Invalid or expired token",
			})
			return
		}

		ctx := context.WithValue(r.Context(), "user", user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ListTasks handles GET /api/tasks
func (h *Handler) ListTasks(w http.ResponseWriter, r *http.Request) {
	user, err := h.authService.GetUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusUnauthorized,
			Message: "User not found in context",
		})
		return
	}

	filter, err := h.parseTaskFilter(r)
	if err != nil {
		h.writeErrorResponse(w, err)
		return
	}

	tasks, total, err := h.repo.GetTasks(r.Context(), user.ID, filter)
	if err != nil {
		h.logger.Printf("Error fetching tasks: %v", err)
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusInternalServerError,
			Message: "Failed to fetch tasks",
		})
		return
	}

	totalPages := int((total + int64(filter.Limit) - 1) / int64(filter.Limit))
	
	response := TaskListResponse{
		Tasks: tasks,
		Pagination: Pagination{
			Page:       filter.Page,
			Limit:      filter.Limit,
			Total:      total,
			TotalPages: totalPages,
		},
	}

	h.writeJSONResponse(w, http.StatusOK, response)
}

// GetTask handles GET /api/tasks/{task_id}
func (h *Handler) GetTask(w http.ResponseWriter, r *http.Request) {
	user, err := h.authService.GetUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusUnauthorized,
			Message: "User not found in context",
		})
		return
	}

	taskID, err := h.parseTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, err)
		return
	}

	task, err := h.repo.GetTaskByID(r.Context(), taskID, user.ID)
	if err != nil {
		h.logger.Printf("Error fetching task %d: %v", taskID, err)
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusNotFound,
			Message: "Task not found",
		})
		return
	}

	h.writeJSONResponse(w, http.StatusOK, task)
}

// CreateTask handles POST /api/tasks
func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	user, err := h.authService.GetUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusUnauthorized,
			Message: "User not found in context",
		})
		return
	}

	var req CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusBadRequest,
			Message: "Invalid JSON payload",
		})
		return
	}

	if err := h.validateCreateTaskRequest(&req); err != nil {
		h.writeErrorResponse(w, err)
		return
	}

	task := &Task{
		UserID:      user.ID,
		Title:       req.Title,
		Description: req.Description,
		Priority:    req.Priority,
		Status:      "pending",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if req.Priority == "" {
		task.Priority = "medium"
	}

	if req.DueDate != "" {
		dueDate, err := time.Parse(time.RFC3339, req.DueDate)
		if err != nil {
			h.writeErrorResponse(w, &AppError{
				Code:    http.StatusBadRequest,
				Message: "Invalid due date format",
			})
			return
		}
		task.DueDate = &dueDate
	}

	if err := h.repo.CreateTask(r.Context(), task); err != nil {
		h.logger.Printf("Error creating task: %v", err)
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusInternalServerError,
			Message: "Failed to create task",
		})
		return
	}

	h.writeJSONResponse(w, http.StatusCreated, task)
}

// UpdateTask handles PUT /api/tasks/{task_id}
func (h *Handler) UpdateTask(w http.ResponseWriter, r *http.Request) {
	user, err := h.authService.GetUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusUnauthorized,
			Message: "User not found in context",
		})
		return
	}

	taskID, err := h.parseTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, err)
		return
	}

	task, err := h.repo.GetTaskByID(r.Context(), taskID, user.ID)
	if err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusNotFound,
			Message: "Task not found",
		})
		return
	}

	var req UpdateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusBadRequest,
			Message: "Invalid JSON payload",
		})
		return
	}

	if err := h.validateUpdateTaskRequest(&req); err != nil {
		h.writeErrorResponse(w, err)
		return
	}

	h.applyTaskUpdates(task, &req)
	task.UpdatedAt = time.Now()

	if err := h.repo.UpdateTask(r.Context(), task); err != nil {
		h.logger.Printf("Error updating task %d: %v", taskID, err)
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusInternalServerError,
			Message: "Failed to update task",
		})
		return
	}

	h.writeJSONResponse(w, http.StatusOK, task)
}

// DeleteTask handles DELETE /api/tasks/{task_id}
func (h *Handler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	user, err := h.authService.GetUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusUnauthorized,
			Message: "User not found in context",
		})
		return
	}

	taskID, err := h.parseTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, err)
		return
	}

	if err := h.repo.DeleteTask(r.Context(), taskID, user.ID); err != nil {
		h.logger.Printf("Error deleting task %d: %v", taskID, err)
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusNotFound,
			Message: "Task not found",
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CompleteTask handles POST /api/tasks/{task_id}/complete
func (h *Handler) CompleteTask(w http.ResponseWriter, r *http.Request) {
	user, err := h.authService.GetUserFromContext(r.Context())
	if err != nil {
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusUnauthorized,
			Message: "User not found in context",
		})
		return
	}

	taskID, err := h.parseTaskID(r)
	if err != nil {
		h.writeErrorResponse(w, err)
		return
	}

	if err := h.repo.CompleteTask(r.Context(), taskID, user.ID); err != nil {
		h.logger.Printf("Error completing task %d: %v", taskID, err)
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusNotFound,
			Message: "Task not found",
		})
		return
	}

	// Fetch updated task to return
	task, err := h.repo.GetTaskByID(r.Context(), taskID, user.ID)
	if err != nil {
		h.logger.Printf("Error fetching completed task %d: %v", taskID, err)
		h.writeErrorResponse(w, &AppError{
			Code:    http.StatusInternalServerError,
			Message: "Task completed but failed to fetch updated task",
		})
		return
	}

	h.writeJSONResponse(w, http.StatusOK, task)
}

// Helper functions

func (h *Handler) parseTaskID(r *http.Request) (int64, *AppError) {
	vars := mux.Vars(r)
	taskIDStr, exists := vars["task_id"]
	if !exists {
		return 0, &AppError{
			Code:    http.StatusBadRequest,
			Message: "Task ID is required",
		}
	}

	taskID, err := strconv.ParseInt(taskIDStr, 10, 64)
	if err != nil {
		return 0, &AppError{
			Code:    http.StatusBadRequest,
			Message: "Invalid task ID format",
		}
	}

	return taskID, nil
}

func (h *Handler) parseTaskFilter(r *http.Request) (TaskFilter, *AppError) {
	filter := TaskFilter{
		Page:  1