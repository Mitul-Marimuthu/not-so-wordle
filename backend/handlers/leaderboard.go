package handlers

import (
	"context"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"wordle/backend/db"
	"wordle/backend/models"
)

type leaderboardEntry struct {
	Rank   int    `json:"rank"`
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
	Score  int    `json:"score"` // meaning depends on which leaderboard is requested
}

// leaderboard is a shared helper called by both public endpoints.
// sortField is the MongoDB field name to sort by ("longestStreak" or "totalSolved").
func leaderboard(w http.ResponseWriter, r *http.Request, sortField string) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Fetch only the top 10 players, sorted descending by the chosen field.
	// The projection limits what MongoDB sends over the wire — we only need
	// name, avatar, and the sort field to build the leaderboard row.
	opts := options.Find().
		SetSort(bson.D{{Key: sortField, Value: -1}}).
		SetLimit(10).
		SetProjection(bson.M{"name": 1, "avatar": 1, sortField: 1})

	cursor, err := db.Collection("users").Find(ctx, bson.M{}, opts)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	var users []models.User
	if err := cursor.All(ctx, &users); err != nil {
		http.Error(w, "decode error", http.StatusInternalServerError)
		return
	}

	// Map each user to a leaderboard row with a 1-based rank.
	entries := make([]leaderboardEntry, 0, len(users))
	for i, u := range users {
		score := u.LongestStreak
		if sortField == "totalSolved" {
			score = u.TotalSolved
		}
		entries = append(entries, leaderboardEntry{
			Rank:   i + 1,
			Name:   u.Name,
			Avatar: u.Avatar,
			Score:  score,
		})
	}

	writeJSON(w, map[string]interface{}{"leaderboard": entries})
}

// LeaderboardStreak returns the top 10 players by longest win streak.
func LeaderboardStreak(w http.ResponseWriter, r *http.Request) {
	leaderboard(w, r, "longestStreak")
}

// LeaderboardTotal returns the top 10 players by total words solved.
func LeaderboardTotal(w http.ResponseWriter, r *http.Request) {
	leaderboard(w, r, "totalSolved")
}
