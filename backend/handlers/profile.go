package handlers

import (
	"context"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"wordle/backend/db"
	authmw "wordle/backend/middleware"
	"wordle/backend/models"
)

// GetProfile returns the authenticated user's stats and full game history.
func GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(authmw.UserIDKey).(string)
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		http.Error(w, "invalid user", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var user models.User
	if err := db.Collection("users").FindOne(ctx, bson.M{"_id": oid}).Decode(&user); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	writeJSON(w, user)
}
