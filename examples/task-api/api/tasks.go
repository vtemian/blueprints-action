package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/pkg/errors"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Custom error types
type TaskError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

func (e TaskError) Error() string {
	return e.Message
}

var (
	ErrTaskNotFound     = TaskError{Code: "TASK_NOT_FOUND", Message: "Task not found"}
	ErrUnauthorized     = TaskError{Code: "UNAUTHORIZED", Message: "Unauthorized access"}
	ErrInvalidInput     = TaskError{Code: "INVALID_INPUT", Message: "Invalid input parameters"}
	ErrInternalServer   = TaskError{Code: "INTERNAL_ERROR", Message: "Internal server error"}
	ErrForbidden        = TaskError{Code: "FORBIDDEN", Message: "Access forbidden"}
	ErrTaskAlreadyDone  = TaskError{Code: "TASK_ALREADY_COMPLETED", Message: "Task is already completed"}
)

// Task model
type Task struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	UserID      uuid.UUID  `json:"user_id" gorm:"type:uuid;not null;index"`
	Title       string     `json:"title" gorm:"not null;size:255"`
	Description string     `json:"description" gorm:"type:text"`
	Priority    string     `json:"priority" gorm:"default:'medium';check:priority IN ('low','medium','high')"`
	Status      string     `json:"status" gorm:"default:'pending';check:status IN ('pending','in_progress','completed','deleted')"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time  `json:"updated_at" gorm:"autoUpdateTime"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty" gorm:"index"`
}

// Request/Response DTOs
type CreateTaskRequest struct {
	Title       string     `json:"title" validate:"required,min=1,max=255"`
	Description string     `json:"description" validate:"max=2000"`
	Priority    string     `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

type UpdateTaskRequest struct {
	Title       *string    `json:"title,omitempty" validate:"omitempty,min=1,max=255"`
	Description *string    `json:"description,omitempty" validate:"omitempty,max=2000"`
	Priority    *string    `json:"priority,omitempty" validate:"omitempty,oneof=low medium high"`
	Status      *string    `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
	DueDate     *time.Time `json:"due_date,omitempty"`
}

type TaskListResponse struct {
	Tasks      []Task     `json:"tasks"`
	Pagination Pagination `json:"pagination"`
}

type Pagination struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

type TaskFilters struct {
	Status    string     `form:"status" validate:"omitempty,oneof=pending in_progress completed"`
	Priority  string     `form:"priority" validate:"omitempty,oneof=low medium high"`
	DueBefore *time.Time `form:"due_before" time_format:"2006-01-02T15:04:05Z07:00"`
	DueAfter  *time.Time `form:"due_after" time_format:"2006-01-02T15:04:05Z07:00"`
	Page      int        `form:"page" validate:"omitempty,min=1"`
	Limit     int        `form:"limit" validate:"omitempty,min=1,max=100"`
}

type ErrorResponse struct {
	Error TaskError `json:"error"`
}

type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// JWT Claims
type JWTClaims struct {
	UserID uuid.UUID `json:"user_id"`
	jwt.RegisteredClaims
}

// Database interface for dependency injection
type TaskRepository interface {
	Create(ctx context.Context, task *Task) error
	GetByID(ctx context.Context, id uuid.UUID) (*Task, error)
	GetByUserID(ctx context.Context, userID uuid.UUID, filters TaskFilters) ([]Task, int64, error)
	Update(ctx context.Context, task *Task) error
	SoftDelete(ctx context.Context, id uuid.UUID) error
	MarkCompleted(ctx context.Context, id uuid.UUID, completedAt time.Time) error
}

// GORM implementation of TaskRepository
type GormTaskRepository struct {
	db *gorm.DB
}

func NewGormTaskRepository(db *gorm.DB) *GormTaskRepository {
	return &GormTaskRepository{db: db}
}

func (r *GormTaskRepository) Create(ctx context.Context, task *Task) error {
	return r.db.WithContext(ctx).Create(task).Error
}

func (r *GormTaskRepository) GetByID(ctx context.Context, id uuid.UUID) (*Task, error) {
	var task Task
	err := r.db.WithContext(ctx).Where("id = ? AND deleted_at IS NULL", id).First(&task).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTaskNotFound
		}
		return nil, err
	}
	return &task, nil
}

func (r *GormTaskRepository) GetByUserID(ctx context.Context, userID uuid.UUID, filters TaskFilters) ([]Task, int64, error) {
	query := r.db.WithContext(ctx).Where("user_id = ? AND deleted_at IS NULL", userID)

	// Apply filters
	if filters.Status != "" {
		query = query.Where("status = ?", filters.Status)
	}
	if filters.Priority != "" {
		query = query.Where("priority = ?", filters.Priority)
	}
	if filters.DueBefore != nil {
		query = query.Where("due_date < ?", *filters.DueBefore)
	}
	if filters.DueAfter != nil {
		query = query.Where("due_date > ?", *filters.DueAfter)
	}

	// Count total records
	var total int64
	if err := query.Model(&Task{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Apply pagination
	if filters.Page < 1 {
		filters.Page = 1
	}
	if filters.Limit < 1 {
		filters.Limit = 20
	}
	offset := (filters.Page - 1) * filters.Limit

	var tasks []Task
	err := query.Order("created_at DESC").Offset(offset).Limit(filters.Limit).Find(&tasks).Error
	return tasks, total, err
}

func (r *GormTaskRepository) Update(ctx context.Context, task *Task) error {
	return r.db.WithContext(ctx).Save(task).Error
}

func (r *GormTaskRepository) SoftDelete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&Task{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":     "deleted",
		"deleted_at": time.Now(),
	}).Error
}

func (r *GormTaskRepository) MarkCompleted(ctx context.Context, id uuid.UUID, completedAt time.Time) error {
	return r.db.WithContext(ctx).Model(&Task{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":       "completed",
		"completed_at": completedAt,
	}).Error
}

// Handler struct with dependencies
type TaskHandler struct {
	repo      TaskRepository
	validator *validator.Validate
	logger    *zap.Logger
	jwtSecret string
}

func NewTaskHandler(repo TaskRepository, logger *zap.Logger, jwtSecret string) *TaskHandler {
	return &TaskHandler{
		repo:      repo,
		validator: validator.New(),
		logger:    logger,
		jwtSecret: jwtSecret,
	}
}

// Middleware for JWT authentication
func (h *TaskHandler) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			h.respondWithError(c, http.StatusUnauthorized, ErrUnauthorized)
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			h.respondWithError(c, http.StatusUnauthorized, ErrUnauthorized)
			c.Abort()
			return
		}

		token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(h.jwtSecret), nil
		})

		if err != nil {
			h.logger.Error("JWT parsing error", zap.Error(err))
			h.respondWithError(c, http.StatusUnauthorized, ErrUnauthorized)
			c.Abort()
			return
		}

		if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
			c.Set("user_id", claims.UserID)
			c.Next()
		} else {
			h.respondWithError(c, http.StatusUnauthorized, ErrUnauthorized)
			c.Abort()
		}
	}
}

// Middleware for task ownership verification
func (h *TaskHandler) OwnershipMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			h.respondWithError(c, http.StatusUnauthorized, ErrUnauthorized)
			c.Abort()
			return
		}

		taskIDStr := c.Param("task_id")
		taskID, err := uuid.Parse(taskIDStr)
		if err != nil {
			h.respondWithError(c, http.StatusBadRequest, TaskError{
				Code:    "INVALID_TASK_ID",
				Message: "Invalid task ID format",
			})
			c.Abort()
			return
		}

		task, err := h.repo.GetByID(c.Request.Context(), taskID)
		if err != nil {
			if errors.Is(err, ErrTaskNotFound) {
				h.respondWithError(c, http.StatusNotFound, ErrTaskNotFound)
			} else {
				h.logger.Error("Database error", zap.Error(err))
				h.respondWithError(c, http.StatusInternalServerError, ErrInternalServer)
			}
			c.Abort()
			return
		}

		if task.UserID != userID.(uuid.UUID) {
			h.respondWithError(c, http.StatusForbidden, ErrForbidden)
			c.Abort()
			return
		}

		c.Set("task", task)
		c.Next()
	}
}

// Handler functions
func (h *TaskHandler) ListTasks(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var filters TaskFilters
	if err := c.ShouldBindQuery(&filters); err != nil {
		h.respondWithError(c, http.StatusBadRequest, TaskError{
			Code:    "INVALID_QUERY_PARAMS",
			Message: "Invalid query parameters",
			Details: err.Error(),
		})
		return
	}

	if err := h.validator.Struct(filters); err != nil {
		h.respondWithError(c, http.StatusBadRequest, TaskError{
			Code:    "VALIDATION_ERROR",
			Message: "Validation failed",
			Details: err.Error(),
		})
		return
	}

	tasks, total, err := h.repo.GetByUserID(c.Request.Context(), userID.(uuid.UUID), filters)
	if err != nil {
		h.logger.Error("Failed to fetch tasks", zap.Error(err))
		h.respondWithError(c, http.StatusInternalServerError, ErrInternalServer)
		return
	}

	// Calculate pagination
	if filters.Limit == 0 {
		filters.Limit = 20
	}
	if filters.Page == 0 {
		filters.Page = 1
	}
	totalPages := int((total + int64(filters.Limit) - 1) / int64(filters.Limit))

	response := TaskListResponse{
		Tasks: tasks,
		Pagination: Pagination{
			Page:       filters.Page,
			Limit:      filters.Limit,
			Total:      total,
			TotalPages: totalPages,
		},
	}

	c.JSON(http.StatusOK, response)
}

func (h *TaskHandler) GetTask(c *gin.Context) {
	task, _ := c.Get("task")
	c.JSON(http.StatusOK, task.(*Task))
}

func (h *TaskHandler) CreateTask(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.respondWithError(c, http.StatusBadRequest, TaskError{
			Code:    "INVALID_JSON",
			Message: "Invalid JSON format",
			Details: err.Error(),
		})
		return
	}

	if err := h.validator.Struct(req); err != nil {
		h.respondWithError(c, http.StatusBadRequest, TaskError{
			Code:    "VALIDATION_ERROR",
			Message: "Validation failed",
			Details: err.Error(),
		})
		return
	}

	// Set default priority if not provided
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	task := &Task{
		UserID:      userID.(uuid.UUID),
		Title:       req.Title,
		Description: req.Description,
		Priority:    priority,
		Status:      "pending",
		DueDate:     req.DueDate,
	}

	if err := h.repo.Create(c.Request.Context(), task); err != nil {
		h.logger.Error("Failed to create task