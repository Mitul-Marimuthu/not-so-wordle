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

// GetProfile returns the full user document for the authenticated player:
// stats (totalSolved, streaks) and the complete game history with dates.
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

	// The User struct's json tags control what the frontend receives.
	// solvedWords is included here but the frontend can ignore it if not needed.
	writeJSON(w, user)
}
