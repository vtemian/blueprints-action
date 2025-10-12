package main

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Task represents the task model in the database
type Task struct {
	ID          uint       `json:"id" gorm:"primaryKey"`
	Title       string     `json:"title" gorm:"not null;size:255"`
	Description string     `json:"description" gorm:"type:text"`
	Status      string     `json:"status" gorm:"default:'pending';check:status IN ('pending','in_progress','completed')"`
	Priority    string     `json:"priority" gorm:"default:'medium';check:priority IN ('low','medium','high')"`
	UserID      uint       `json:"user_id" gorm:"not null;index"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"-" gorm:"index"` // Soft delete
}

// CreateTaskRequest represents the request payload for creating a task
type CreateTaskRequest struct {
	Title       string `json:"title" validate:"required,min=1,max=255"`
	Description string `json:"description" validate:"max=1000"`
	Priority    string `json:"priority" validate:"omitempty,oneof=low medium high"`
}

// UpdateTaskRequest represents the request payload for updating a task
type UpdateTaskRequest struct {
	Title       *string `json:"title,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string `json:"description,omitempty" validate:"omitempty,max=1000"`
	Status      *string `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
	Priority    *string `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
}

// TaskQueryParams represents query parameters for filtering tasks
type TaskQueryParams struct {
	Status   string `form:"status" validate:"omitempty,oneof=pending in_progress completed"`
	Priority string `form:"priority" validate:"omitempty,oneof=low medium high"`
	Page     int    `form:"page" validate:"omitempty,min=1"`
	Limit    int    `form:"limit" validate:"omitempty,min=1,max=100"`
}

// PaginatedResponse represents a paginated response wrapper
type PaginatedResponse struct {
	Data       interface{} `json:"data"`
	Page       int         `json:"page"`
	Limit      int         `json:"limit"`
	Total      int64       `json:"total"`
	TotalPages int         `json:"total_pages"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string      `json:"error"`
	Message string      `json:"message,omitempty"`
	Details interface{} `json:"details,omitempty"`
}

// JWTClaims represents JWT token claims
type JWTClaims struct {
	UserID uint   `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// TaskAPI handles all task-related endpoints
type TaskAPI struct {
	db        *gorm.DB
	validator *validator.Validate
	jwtSecret []byte
}

// NewTaskAPI creates a new TaskAPI instance
func NewTaskAPI(db *gorm.DB, jwtSecret string) *TaskAPI {
	return &TaskAPI{
		db:        db,
		validator: validator.New(),
		jwtSecret: []byte(jwtSecret),
	}
}

// JWTMiddleware validates JWT tokens and extracts user information
func (api *TaskAPI) JWTMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "unauthorized",
				Message: "Authorization header is required",
			})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid authorization header format",
			})
			c.Abort()
			return
		}

		tokenString := tokenParts[1]
		token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return api.jwtSecret, nil
		})

		if err != nil {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid or expired token",
			})
			c.Abort()
			return
		}

		if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
			c.Set("user_id", claims.UserID)
			c.Set("user_email", claims.Email)
			c.Next()
		} else {
			c.JSON(http.StatusUnauthorized, ErrorResponse{
				Error:   "unauthorized",
				Message: "Invalid token claims",
			})
			c.Abort()
			return
		}
	}
}

// getUserID extracts user ID from the Gin context
func (api *TaskAPI) getUserID(c *gin.Context) (uint, error) {
	userID, exists := c.Get("user_id")
	if !exists {
		return 0, fmt.Errorf("user ID not found in context")
	}
	
	id, ok := userID.(uint)
	if !ok {
		return 0, fmt.Errorf("invalid user ID type")
	}
	
	return id, nil
}

// verifyTaskOwnership checks if the current user owns the specified task
func (api *TaskAPI) verifyTaskOwnership(c *gin.Context, taskID uint) (*Task, error) {
	userID, err := api.getUserID(c)
	if err != nil {
		return nil, err
	}

	var task Task
	result := api.db.Where("id = ? AND user_id = ?", taskID, userID).First(&task)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("task not found or access denied")
		}
		return nil, result.Error
	}

	return &task, nil
}

// ListTasks handles GET /api/tasks - List tasks with filtering and pagination
func (api *TaskAPI) ListTasks(c *gin.Context) {
	userID, err := api.getUserID(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "internal_error",
			Message: "Failed to get user information",
		})
		return
	}

	var params TaskQueryParams
	if err := c.ShouldBindQuery(&params); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_query_params",
			Message: "Invalid query parameters",
			Details: err.Error(),
		})
		return
	}

	if err := api.validator.Struct(params); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "validation_error",
			Message: "Query parameter validation failed",
			Details: err.Error(),
		})
		return
	}

	// Set default pagination values
	if params.Page == 0 {
		params.Page = 1
	}
	if params.Limit == 0 {
		params.Limit = 10
	}

	// Build query
	query := api.db.Where("user_id = ?", userID)

	if params.Status != "" {
		query = query.Where("status = ?", params.Status)
	}
	if params.Priority != "" {
		query = query.Where("priority = ?", params.Priority)
	}

	// Count total records
	var total int64
	if err := query.Model(&Task{}).Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "database_error",
			Message: "Failed to count tasks",
		})
		return
	}

	// Get paginated results
	var tasks []Task
	offset := (params.Page - 1) * params.Limit
	if err := query.Offset(offset).Limit(params.Limit).Order("created_at DESC").Find(&tasks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "database_error",
			Message: "Failed to fetch tasks",
		})
		return
	}

	totalPages := int((total + int64(params.Limit) - 1) / int64(params.Limit))

	response := PaginatedResponse{
		Data:       tasks,
		Page:       params.Page,
		Limit:      params.Limit,
		Total:      total,
		TotalPages: totalPages,
	}

	c.JSON(http.StatusOK, response)
}

// GetTask handles GET /api/tasks/{task_id} - Get single task with ownership verification
func (api *TaskAPI) GetTask(c *gin.Context) {
	taskIDStr := c.Param("task_id")
	taskID, err := strconv.ParseUint(taskIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_task_id",
			Message: "Task ID must be a valid number",
		})
		return
	}

	task, err := api.verifyTaskOwnership(c, uint(taskID))
	if err != nil {
		if err.Error() == "task not found or access denied" {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "task_not_found",
				Message: "Task not found or access denied",
			})
		} else {
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error:   "database_error",
				Message: "Failed to fetch task",
			})
		}
		return
	}

	c.JSON(http.StatusOK, task)
}

// CreateTask handles POST /api/tasks - Create new task with validation
func (api *TaskAPI) CreateTask(c *gin.Context) {
	userID, err := api.getUserID(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "internal_error",
			Message: "Failed to get user information",
		})
		return
	}

	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_json",
			Message: "Invalid JSON payload",
			Details: err.Error(),
		})
		return
	}

	if err := api.validator.Struct(req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "validation_error",
			Message: "Request validation failed",
			Details: err.Error(),
		})
		return
	}

	// Set default priority if not provided
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	task := Task{
		Title:       req.Title,
		Description: req.Description,
		Status:      "pending",
		Priority:    priority,
		UserID:      userID,
	}

	if err := api.db.Create(&task).Error; err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "database_error",
			Message: "Failed to create task",
		})
		return
	}

	c.JSON(http.StatusCreated, task)
}

// UpdateTask handles PUT /api/tasks/{task_id} - Update task with ownership checks
func (api *TaskAPI) UpdateTask(c *gin.Context) {
	taskIDStr := c.Param("task_id")
	taskID, err := strconv.ParseUint(taskIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_task_id",
			Message: "Task ID must be a valid number",
		})
		return
	}

	task, err := api.verifyTaskOwnership(c, uint(taskID))
	if err != nil {
		if err.Error() == "task not found or access denied" {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "task_not_found",
				Message: "Task not found or access denied",
			})
		} else {
			c.JSON(http.StatusInternalServerError, ErrorResponse{
				Error:   "database_error",
				Message: "Failed to fetch task",
			})
		}
		return
	}

	var req UpdateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "invalid_json",
			Message: "Invalid JSON payload",
			Details: err.Error(),
		})
		return
	}

	if err := api.validator.Struct(req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "validation_error",
			Message: "Request validation failed",
			Details: err.Error(),
		})
		return
	}

	// Update only provided fields
	updates := make(map[string]interface{})
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Status != nil {
		updates["status"] = *req.Status
		// Set completed_at timestamp if status is completed
		if *req.Status == "completed" && task.CompletedAt == nil {
			now := time.Now()
			updates["completed_at"] = &now
		} else if *req.Status != "completed" {
			updates["completed_at"] = nil
		}
	}
	if req.Priority != nil {
		updates["priority"] = *req.Priority
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "no_updates",
			Message: "No valid fields provided for update",
		})
		return
	}

	if err := api.db.Model(task).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "database_error",
			Message: "Failed to update task",
		})
		return
	}

	// Fetch updated task
	if err := api.db.First(task, task.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "database_error",
			Message: "