package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type Task struct {
	ID          int       `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	Priority    string    `json:"priority"`
	DueDate     *string   `json:"due_date"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

var (
	taskMu sync.RWMutex
	tasks  = make([]Task, 0)
	nextID = 1
)

var allowedStatuses = map[string]bool{"Todo": true, "In Progress": true, "Done": true}
var allowedPriorities = map[string]bool{"Urgent": true, "High": true, "Medium": true, "Low": true}

func main() {
	router := gin.Default()
	api := router.Group("/api")
	{
		api.GET("/tasks", getTasks)
		api.POST("/tasks", createTask)
		api.PATCH("/tasks/:id", updateTask)
		api.DELETE("/tasks/:id", deleteTask)
	}

	if err := router.Run(":8080"); err != nil {
		panic(err)
	}
}

func getTasks(c *gin.Context) {
	taskMu.RLock()
	result := append([]Task{}, tasks...)
	taskMu.RUnlock()
	c.JSON(http.StatusOK, result)
}

func createTask(c *gin.Context) {
	var input struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Status      string  `json:"status"`
		Priority    string  `json:"priority"`
		DueDate     *string `json:"due_date"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON body"})
		return
	}

	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
		return
	}
	if len([]rune(input.Title)) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title must be 200 characters or fewer"})
		return
	}
	if len([]rune(input.Description)) > 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Description must be 5000 characters or fewer"})
		return
	}
	if input.Status == "" {
		input.Status = "Todo"
	}
	if !allowedStatuses[input.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
		return
	}
	if input.Priority == "" {
		input.Priority = "Medium"
	}
	if !allowedPriorities[input.Priority] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid priority"})
		return
	}
	if err := validateDueDate(input.DueDate); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now().UTC()
	taskMu.Lock()
	task := Task{
		ID:          nextID,
		Title:       input.Title,
		Description: input.Description,
		Status:      input.Status,
		Priority:    input.Priority,
		DueDate:     input.DueDate,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	nextID++
	tasks = append(tasks, task)
	taskMu.Unlock()

	c.JSON(http.StatusCreated, task)
}

func updateTask(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid task ID"})
		return
	}

	var fields map[string]json.RawMessage
	if err := c.ShouldBindJSON(&fields); err != nil || fields == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON body"})
		return
	}
	if len(fields) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "At least one task field is required"})
		return
	}
	for key := range fields {
		if key != "title" && key != "description" && key != "status" && key != "priority" && key != "due_date" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported task field: " + key})
			return
		}
	}

	taskMu.Lock()
	defer taskMu.Unlock()
	for i := range tasks {
		if tasks[i].ID != id {
			continue
		}
		updated := tasks[i]
		if raw, ok := fields["title"]; ok {
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || strings.TrimSpace(value) == "" || len([]rune(strings.TrimSpace(value))) > 200 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required and must be 200 characters or fewer"})
				return
			}
			updated.Title = strings.TrimSpace(value)
		}
		if raw, ok := fields["description"]; ok {
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || len([]rune(value)) > 5000 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Description must be 5000 characters or fewer"})
				return
			}
			updated.Description = value
		}
		if raw, ok := fields["status"]; ok {
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || !allowedStatuses[value] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
				return
			}
			updated.Status = value
		}
		if raw, ok := fields["priority"]; ok {
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || !allowedPriorities[value] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid priority"})
				return
			}
			updated.Priority = value
		}
		if raw, ok := fields["due_date"]; ok {
			var value *string
			if string(raw) != "null" {
				var parsed string
				if err := json.Unmarshal(raw, &parsed); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Due date must use YYYY-MM-DD format or null"})
					return
				}
				value = &parsed
			}
			if err := validateDueDate(value); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			updated.DueDate = value
		}
		updated.UpdatedAt = time.Now().UTC()
		tasks[i] = updated
		c.JSON(http.StatusOK, updated)
		return
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
}

func validateDueDate(value *string) error {
	if value == nil {
		return nil
	}
	if _, err := time.Parse("2006-01-02", *value); err != nil {
		return &dateValidationError{}
	}
	return nil
}

type dateValidationError struct{}

func (*dateValidationError) Error() string { return "Due date must use YYYY-MM-DD format" }

func deleteTask(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid task ID"})
		return
	}

	taskMu.Lock()
	defer taskMu.Unlock()
	for i := range tasks {
		if tasks[i].ID == id {
			tasks = append(tasks[:i], tasks[i+1:]...)
			c.Status(http.StatusNoContent)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
}
