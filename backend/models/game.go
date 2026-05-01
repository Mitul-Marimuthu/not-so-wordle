package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// GameStatus is the lifecycle state of a game session.
type GameStatus string

const (
	StatusInProgress GameStatus = "in_progress"
	StatusWon        GameStatus = "won"
	StatusLost       GameStatus = "lost"
)

// GuessResult stores one guess and the tile-color feedback for that guess.
type GuessResult struct {
	Guess     string    `bson:"guess"     json:"guess"`
	// Result is a 5-element slice: "+" green, "x" yellow, "-" gray.
	Result    []string  `bson:"result"    json:"result"`
	Timestamp time.Time `bson:"timestamp" json:"timestamp"`
}

// Game is one play session stored in the "games" collection.
type Game struct {
	ID     primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID primitive.ObjectID `bson:"userId"        json:"userId"`
	// Word is the target the player is trying to guess.
	// json:"-" means it is NEVER serialised into an API response,
	// so the answer stays server-side at all times.
	Word        string             `bson:"word"                  json:"-"`
	Guesses     []GuessResult      `bson:"guesses"               json:"guesses"`
	Status      GameStatus         `bson:"status"                json:"status"`
	StartedAt   time.Time          `bson:"startedAt"             json:"startedAt"`
	CompletedAt *time.Time         `bson:"completedAt,omitempty" json:"completedAt,omitempty"`
}
