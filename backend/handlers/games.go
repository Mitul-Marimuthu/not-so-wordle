package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"wordle/backend/db"
	"wordle/backend/game"
	authmw "wordle/backend/middleware"
	"wordle/backend/models"
)

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// NewGame starts a fresh game for the authenticated user.
// If an in-progress game already exists, it returns that game's ID instead
// of creating a duplicate.
func NewGame(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(authmw.UserIDKey).(string)
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		http.Error(w, "invalid user", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Return existing in-progress game if one exists
	var existing models.Game
	err = db.Collection("games").FindOne(ctx, bson.M{
		"userId": oid,
		"status": models.StatusInProgress,
	}).Decode(&existing)
	if err == nil {
		writeJSON(w, map[string]string{"gameId": existing.ID.Hex(), "status": string(existing.Status)})
		return
	}

	// Fetch user's solved words for weighted selection
	var user models.User
	if err := db.Collection("users").FindOne(ctx, bson.M{"_id": oid}).Decode(&user); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	word, err := game.SelectWord(ctx, user.SolvedWords)
	if err != nil {
		http.Error(w, "failed to select word", http.StatusInternalServerError)
		return
	}

	g := models.Game{
		ID:        primitive.NewObjectID(),
		UserID:    oid,
		Word:      word,
		Guesses:   []models.GuessResult{},
		Status:    models.StatusInProgress,
		StartedAt: time.Now(),
	}
	if _, err := db.Collection("games").InsertOne(ctx, g); err != nil {
		http.Error(w, "failed to create game", http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]string{"gameId": g.ID.Hex(), "status": string(g.Status)})
}

// SubmitGuess validates a guess against the active game and returns tile results.
func SubmitGuess(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(authmw.UserIDKey).(string)
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		http.Error(w, "invalid user", http.StatusUnauthorized)
		return
	}

	goid, err := primitive.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid game id", http.StatusBadRequest)
		return
	}

	var body struct {
		Guess string `json:"guess"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	guess := strings.ToLower(strings.TrimSpace(body.Guess))
	if len([]rune(guess)) != 5 {
		http.Error(w, "guess must be exactly 5 letters", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var g models.Game
	if err := db.Collection("games").FindOne(ctx, bson.M{"_id": goid, "userId": oid}).Decode(&g); err != nil {
		http.Error(w, "game not found", http.StatusNotFound)
		return
	}
	if g.Status != models.StatusInProgress {
		http.Error(w, "game is already finished", http.StatusConflict)
		return
	}

	// Validate the guess is a known word
	count, err := db.Collection("words").CountDocuments(ctx, bson.M{"word": guess})
	if err != nil || count == 0 {
		http.Error(w, "not a valid word", http.StatusUnprocessableEntity)
		return
	}

	result := game.EvaluateGuess(guess, g.Word)
	entry := models.GuessResult{Guess: guess, Result: result, Timestamp: time.Now()}

	won := guess == g.Word
	lost := !won && len(g.Guesses)+1 >= 6

	status := models.StatusInProgress
	if won {
		status = models.StatusWon
	} else if lost {
		status = models.StatusLost
	}

	// Update game record
	now := time.Now()
	setFields := bson.M{"status": status}
	if status != models.StatusInProgress {
		setFields["completedAt"] = now
	}
	db.Collection("games").UpdateOne(ctx, bson.M{"_id": goid}, bson.M{
		"$push": bson.M{"guesses": entry},
		"$set":  setFields,
	})

	// Update user stats
	if status == models.StatusWon {
		var u models.User
		db.Collection("users").FindOne(ctx, bson.M{"_id": oid}).Decode(&u)
		newStreak := u.CurrentStreak + 1
		newLongest := u.LongestStreak
		if newStreak > newLongest {
			newLongest = newStreak
		}
		db.Collection("users").UpdateOne(ctx, bson.M{"_id": oid}, bson.M{
			"$inc":      bson.M{"totalSolved": 1},
			"$set":      bson.M{"currentStreak": newStreak, "longestStreak": newLongest},
			"$addToSet": bson.M{"solvedWords": g.Word},
			"$push": bson.M{"history": models.SolvedEntry{
				Word:    g.Word,
				Date:    now,
				Guesses: len(g.Guesses) + 1,
			}},
		})
	} else if status == models.StatusLost {
		db.Collection("users").UpdateOne(ctx, bson.M{"_id": oid},
			bson.M{"$set": bson.M{"currentStreak": 0}})
	}

	resp := map[string]interface{}{
		"result":      result,
		"status":      status,
		"guessNumber": len(g.Guesses) + 1,
	}
	if status != models.StatusInProgress {
		resp["word"] = g.Word
	}
	writeJSON(w, resp)
}

// GetGame returns the current state of a game (without revealing the word
// unless the game is finished).
func GetGame(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(authmw.UserIDKey).(string)
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		http.Error(w, "invalid user", http.StatusUnauthorized)
		return
	}

	goid, err := primitive.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid game id", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Exclude the word field from the projection
	proj := options.FindOne().SetProjection(bson.M{"word": 0})
	var g models.Game
	if err := db.Collection("games").FindOne(ctx, bson.M{"_id": goid, "userId": oid}, proj).Decode(&g); err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, "game not found", http.StatusNotFound)
			return
		}
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, g)
}
