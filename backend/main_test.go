package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func testRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	taskMu.Lock()
	previousTasks, previousID := tasks, nextID
	tasks, nextID = []Task{}, 1
	taskMu.Unlock()
	t.Cleanup(func() {
		taskMu.Lock()
		tasks, nextID = previousTasks, previousID
		taskMu.Unlock()
	})

	router := gin.New()
	router.GET("/api/tasks", getTasks)
	router.POST("/api/tasks", createTask)
	router.PATCH("/api/tasks/:id", updateTask)
	router.DELETE("/api/tasks/:id", deleteTask)
	return router
}

func requestJSON(router http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	return res
}

func TestTaskAPIFieldsAndValidation(t *testing.T) {
	router := testRouter(t)
	created := requestJSON(router, http.MethodPost, "/api/tasks", `{"title":"Plan release","description":"Notes","status":"Todo","priority":"Urgent","due_date":"2026-11-02"}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", created.Code, created.Body)
	}
	var task Task
	if err := json.Unmarshal(created.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}
	if task.Title != "Plan release" || task.Description != "Notes" || task.Priority != "Urgent" || task.DueDate == nil || *task.DueDate != "2026-11-02" || task.CreatedAt.IsZero() || task.UpdatedAt.IsZero() {
		t.Fatalf("create response missing task fields: %+v", task)
	}
	createdAt := task.CreatedAt

	updated := requestJSON(router, http.MethodPatch, "/api/tasks/1", `{"title":"Ship release","description":"Final checklist","status":"In Progress","priority":"Low","due_date":null}`)
	if updated.Code != http.StatusOK {
		t.Fatalf("patch status = %d, body = %s", updated.Code, updated.Body)
	}
	if err := json.Unmarshal(updated.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}
	if task.Title != "Ship release" || task.Description != "Final checklist" || task.Status != "In Progress" || task.Priority != "Low" || task.DueDate != nil || !task.CreatedAt.Equal(createdAt) || task.UpdatedAt.Before(createdAt) {
		t.Fatalf("patch response did not preserve/update fields correctly: %+v", task)
	}

	for _, body := range []string{`{"status":"Blocked"}`, `{"priority":"Critical"}`} {
		if res := requestJSON(router, http.MethodPatch, "/api/tasks/1", body); res.Code != http.StatusBadRequest {
			t.Errorf("patch %s status = %d, want %d", body, res.Code, http.StatusBadRequest)
		}
	}
}
