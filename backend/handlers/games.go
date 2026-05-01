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

// writeJSON is a small helper that sets the Content-Type header and encodes
// the value as JSON. Used by every handler that returns data.
func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// NewGame starts a fresh game for the authenticated user.
// If the player already has an in-progress game it returns that instead of
// creating a duplicate — one active game per user at a time.
func NewGame(w http.ResponseWriter, r *http.Request) {
	// Pull the user ID that RequireAuth stored in the context.
	userID := r.Context().Value(authmw.UserIDKey).(string)
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		http.Error(w, "invalid user", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Return the existing game rather than silently creating a second one.
	var existing models.Game
	err = db.Collection("games").FindOne(ctx, bson.M{
		"userId": oid,
		"status": models.StatusInProgress,
	}).Decode(&existing)
	if err == nil {
		writeJSON(w, map[string]string{"gameId": existing.ID.Hex(), "status": string(existing.Status)})
		return
	}

	// Load the user's solved words so SelectWord can weight fresh words higher.
	var user models.User
	if err := db.Collection("users").FindOne(ctx, bson.M{"_id": oid}).Decode(&user); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// SelectWord picks a word the player hasn't seen (or rarely seen) before.
	word, err := game.SelectWord(ctx, user.SolvedWords)
	if err != nil {
		http.Error(w, "failed to select word", http.StatusInternalServerError)
		return
	}

	g := models.Game{
		ID:        primitive.NewObjectID(),
		UserID:    oid,
		Word:      word, // stored in DB but NEVER returned to the frontend
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

// SubmitGuess validates a guess against the active game and returns tile feedback.
// The response always includes the per-letter result array. The target word is
// only included once the game is finished (won or lost).
func SubmitGuess(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(authmw.UserIDKey).(string)
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		http.Error(w, "invalid user", http.StatusUnauthorized)
		return
	}

	// Parse the game ID from the URL path parameter (/api/games/{id}/guess).
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
	// Normalise: lowercase and trim whitespace so "CRANE " == "crane".
	guess := strings.ToLower(strings.TrimSpace(body.Guess))
	if len([]rune(guess)) != 5 {
		http.Error(w, "guess must be exactly 5 letters", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Fetch the game and make sure it belongs to this user.
	var g models.Game
	if err := db.Collection("games").FindOne(ctx, bson.M{"_id": goid, "userId": oid}).Decode(&g); err != nil {
		http.Error(w, "game not found", http.StatusNotFound)
		return
	}
	if g.Status != models.StatusInProgress {
		http.Error(w, "game is already finished", http.StatusConflict)
		return
	}

	// Reject guesses that aren't in our word list — same rule as the real Wordle.
	count, err := db.Collection("words").CountDocuments(ctx, bson.M{"word": guess})
	if err != nil || count == 0 {
		http.Error(w, "not a valid word", http.StatusUnprocessableEntity)
		return
	}

	// Core game logic: compute the green/yellow/gray result.
	result := game.EvaluateGuess(guess, g.Word)
	entry := models.GuessResult{Guess: guess, Result: result, Timestamp: time.Now()}

	won := guess == g.Word
	lost := !won && len(g.Guesses)+1 >= 6 // 6 guesses used and still wrong

	status := models.StatusInProgress
	if won {
		status = models.StatusWon
	} else if lost {
		status = models.StatusLost
	}

	// Persist the new guess and (if applicable) the final status.
	now := time.Now()
	setFields := bson.M{"status": status}
	if status != models.StatusInProgress {
		setFields["completedAt"] = now
	}
	db.Collection("games").UpdateOne(ctx, bson.M{"_id": goid}, bson.M{
		"$push": bson.M{"guesses": entry},
		"$set":  setFields,
	})

	// Update the player's profile stats now that the game is decided.
	if status == models.StatusWon {
		// Fetch current streak to correctly compute the new longest streak.
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
			"$addToSet": bson.M{"solvedWords": g.Word},  // $addToSet avoids duplicates
			"$push": bson.M{"history": models.SolvedEntry{
				Word:    g.Word,
				Date:    now,
				Guesses: len(g.Guesses) + 1,
			}},
		})
	} else if status == models.StatusLost {
		// Streak resets to 0 on any loss.
		db.Collection("users").UpdateOne(ctx, bson.M{"_id": oid},
			bson.M{"$set": bson.M{"currentStreak": 0}})
	}

	resp := map[string]interface{}{
		"result":      result,
		"status":      status,
		"guessNumber": len(g.Guesses) + 1,
	}
	// Only reveal the answer once the game is over.
	if status != models.StatusInProgress {
		resp["word"] = g.Word
	}
	writeJSON(w, resp)
}

// GetGame returns the state of a game so the frontend can restore it on refresh.
// The target word is excluded from the projection unless the game is finished.
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

	// Exclude the word field at the DB level — safer than relying on json:"-" alone.
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
