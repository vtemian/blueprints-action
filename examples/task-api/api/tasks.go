package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

// Request/Response Models
type CreateTaskRequest struct {
	Title       string     `json:"title" validate:"required,min=1,max=255"`
	Description string     `json:"description" validate:"required,min=1,max=1000"`
	Priority    *string    `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

type UpdateTaskRequest struct {
	Title       *string    `json:"title,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string    `json:"description,omitempty" validate:"omitempty,min=1,max=1000"`
	Priority    *string    `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Status      *string    `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
}

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

type TaskListResponse struct {
	Tasks      []TaskResponse `json:"tasks"`
	Total      int            `json:"total"`
	Page       int            `json:"page"`
	Limit      int            `json:"limit"`
	TotalPages int            `json:"total_pages"`
}

type ErrorResponse struct {
	Error   string                 `json:"error"`
	Message string                 `json:"message"`
	Details map[string]interface{} `json:"details,omitempty"`
}

type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Task represents the task model
type Task struct {
	ID          int        `db:"id"`
	Title       string     `db:"title"`
	Description string     `db:"description"`
	Priority    string     `db:"priority"`
	Status      string     `db:"status"`
	DueDate     *time.Time `db:"due_date"`
	CompletedAt *time.Time `db:"completed_at"`
	CreatedAt   time.Time  `db:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at"`
	DeletedAt   *time.Time `db:"deleted_at"`
	UserID      int        `db:"user_id"`
}

// Repository interface for dependency injection
type TaskRepository interface {
	GetTasksByUserID(ctx context.Context, userID int, filters TaskFilters, offset, limit int) ([]Task, int, error)
	GetTaskByID(ctx context.Context, taskID int) (*Task, error)
	CreateTask(ctx context.Context, task *Task) error
	UpdateTask(ctx context.Context, task *Task) error
	SoftDeleteTask(ctx context.Context, taskID int) error
	MarkTaskComplete(ctx context.Context, taskID int, completedAt time.Time) error
}

// AuthService interface for JWT handling
type AuthService interface {
	ValidateToken(token string) (*Claims, error)
}

type Claims struct {
	UserID int    `json:"user_id"`
	Email  string `json:"email"`
}

// TaskFilters for query parameters
type TaskFilters struct {
	Status    string
	Priority  string
	DueBefore *time.Time
	DueAfter  *time.Time
}

// TaskHandler contains dependencies
type TaskHandler struct {
	repo      TaskRepository
	auth      AuthService
	validator *validator.Validate
}

// NewTaskHandler creates a new task handler with dependencies
func NewTaskHandler(repo TaskRepository, auth AuthService) *TaskHandler {
	return &TaskHandler{
		repo:      repo,
		auth:      auth,
		validator: validator.New(),
	}
}

// JWT Authentication Middleware
func (h *TaskHandler) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			h.errorResponse(c, http.StatusUnauthorized, "missing_auth_header", "Authorization header is required", nil)
			c.Abort()
			return
		}

		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			h.errorResponse(c, http.StatusUnauthorized, "invalid_auth_header", "Authorization header must be Bearer token", nil)
			c.Abort()
			return
		}

		claims, err := h.auth.ValidateToken(tokenParts[1])
		if err != nil {
			log.Printf("Token validation failed: %v", err)
			h.errorResponse(c, http.StatusUnauthorized, "invalid_token", "Invalid or expired token", nil)
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Next()
	}
}

// GET /api/tasks - List user's tasks with filtering and pagination
func (h *TaskHandler) ListTasks(c *gin.Context) {
	userID := c.GetInt("user_id")
	
	// Parse pagination parameters
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit < 1 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	
	offset := (page - 1) * limit

	// Parse filters
	filters := TaskFilters{
		Status:   c.Query("status"),
		Priority: c.Query("priority"),
	}

	if dueBefore := c.Query("due_before"); dueBefore != "" {
		if parsed, err := time.Parse(time.RFC3339, dueBefore); err == nil {
			filters.DueBefore = &parsed
		} else {
			h.errorResponse(c, http.StatusBadRequest, "invalid_date_format", "due_before must be in RFC3339 format", map[string]interface{}{
				"field": "due_before",
				"value": dueBefore,
			})
			return
		}
	}

	if dueAfter := c.Query("due_after"); dueAfter != "" {
		if parsed, err := time.Parse(time.RFC3339, dueAfter); err == nil {
			filters.DueAfter = &parsed
		} else {
			h.errorResponse(c, http.StatusBadRequest, "invalid_date_format", "due_after must be in RFC3339 format", map[string]interface{}{
				"field": "due_after",
				"value": dueAfter,
			})
			return
		}
	}

	// Validate filter values
	if filters.Status != "" && !isValidStatus(filters.Status) {
		h.errorResponse(c, http.StatusBadRequest, "invalid_status", "Status must be one of: pending, in_progress, completed", nil)
		return
	}

	if filters.Priority != "" && !isValidPriority(filters.Priority) {
		h.errorResponse(c, http.StatusBadRequest, "invalid_priority", "Priority must be one of: low, medium, high", nil)
		return
	}

	tasks, total, err := h.repo.GetTasksByUserID(c.Request.Context(), userID, filters, offset, limit)
	if err != nil {
		log.Printf("Failed to get tasks for user %d: %v", userID, err)
		h.errorResponse(c, http.StatusInternalServerError, "database_error", "Failed to retrieve tasks", nil)
		return
	}

	taskResponses := make([]TaskResponse, len(tasks))
	for i, task := range tasks {
		taskResponses[i] = h.taskToResponse(task)
	}

	totalPages := (total + limit - 1) / limit

	response := TaskListResponse{
		Tasks:      taskResponses,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}

	c.JSON(http.StatusOK, response)
}

// GET /api/tasks/:id - Get single task with ownership verification
func (h *TaskHandler) GetTask(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_task_id", "Task ID must be a valid integer", nil)
		return
	}

	task, err := h.repo.GetTaskByID(c.Request.Context(), taskID)
	if err != nil {
		if err == sql.ErrNoRows {
			h.errorResponse(c, http.StatusNotFound, "task_not_found", "Task not found", nil)
			return
		}
		log.Printf("Failed to get task %d: %v", taskID, err)
		h.errorResponse(c, http.StatusInternalServerError, "database_error", "Failed to retrieve task", nil)
		return
	}

	if !h.verifyTaskOwnership(task, userID) {
		h.errorResponse(c, http.StatusForbidden, "access_denied", "You don't have permission to access this task", nil)
		return
	}

	c.JSON(http.StatusOK, h.taskToResponse(*task))
}

// POST /api/tasks - Create task
func (h *TaskHandler) CreateTask(c *gin.Context) {
	userID := c.GetInt("user_id")
	
	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_json", "Invalid JSON format", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	if err := h.validator.Struct(&req); err != nil {
		h.validationErrorResponse(c, err)
		return
	}

	task := &Task{
		Title:       req.Title,
		Description: req.Description,
		Priority:    "medium", // default priority
		Status:      "pending",
		DueDate:     req.DueDate,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		UserID:      userID,
	}

	if req.Priority != nil {
		task.Priority = *req.Priority
	}

	if err := h.repo.CreateTask(c.Request.Context(), task); err != nil {
		log.Printf("Failed to create task for user %d: %v", userID, err)
		h.errorResponse(c, http.StatusInternalServerError, "database_error", "Failed to create task", nil)
		return
	}

	c.JSON(http.StatusCreated, SuccessResponse{
		Message: "Task created successfully",
		Data:    h.taskToResponse(*task),
	})
}

// PUT /api/tasks/:id - Update task with ownership verification
func (h *TaskHandler) UpdateTask(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_task_id", "Task ID must be a valid integer", nil)
		return
	}

	var req UpdateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_json", "Invalid JSON format", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	if err := h.validator.Struct(&req); err != nil {
		h.validationErrorResponse(c, err)
		return
	}

	task, err := h.repo.GetTaskByID(c.Request.Context(), taskID)
	if err != nil {
		if err == sql.ErrNoRows {
			h.errorResponse(c, http.StatusNotFound, "task_not_found", "Task not found", nil)
			return
		}
		log.Printf("Failed to get task %d: %v", taskID, err)
		h.errorResponse(c, http.StatusInternalServerError, "database_error", "Failed to retrieve task", nil)
		return
	}

	if !h.verifyTaskOwnership(task, userID) {
		h.errorResponse(c, http.StatusForbidden, "access_denied", "You don't have permission to update this task", nil)
		return
	}

	// Update fields if provided
	if req.Title != nil {
		task.Title = *req.Title
	}
	if req.Description != nil {
		task.Description = *req.Description
	}
	if req.Priority != nil {
		task.Priority = *req.Priority
	}
	if req.Status != nil {
		task.Status = *req.Status
		// If marking as completed, set completed_at timestamp
		if *req.Status == "completed" && task.CompletedAt == nil {
			now := time.Now()
			task.CompletedAt = &now
		}
	}
	if req.DueDate != nil {
		task.DueDate = req.DueDate
	}
	
	task.UpdatedAt = time.Now()

	if err := h.repo.UpdateTask(c.Request.Context(), task); err != nil {
		log.Printf("Failed to update task %d: %v", taskID, err)
		h.errorResponse(c, http.StatusInternalServerError, "database_error", "Failed to update task", nil)
		return
	}

	c.JSON(http.StatusOK, SuccessResponse{
		Message: "Task updated successfully",
		Data:    h.taskToResponse(*task),
	})
}

// DELETE /api/tasks/:id - Soft delete with ownership verification
func (h *TaskHandler) DeleteTask(c *gin.Context) {
	userID := c.GetInt("user_id")
	taskID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_task_id", "Task ID must be a valid integer", nil)
		return
	}

	task, err := h.repo.GetTaskByID(c.Request.Context(), taskID)
	if err != nil {
		if err == sql.ErrNoRows {
			h.errorResponse(c, http.StatusNotFound, "task_not_found", "Task not found", nil)
			return
		}
		log.Printf("Failed to get task %d: %v", taskID, err)