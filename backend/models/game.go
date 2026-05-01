package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type GameStatus string

const (
	StatusInProgress GameStatus = "in_progress"
	StatusWon        GameStatus = "won"
	StatusLost       GameStatus = "lost"
)

type GuessResult struct {
	Guess     string    `bson:"guess"     json:"guess"`
	Result    []string  `bson:"result"    json:"result"`
	Timestamp time.Time `bson:"timestamp" json:"timestamp"`
}

type Game struct {
	ID          primitive.ObjectID `bson:"_id,omitempty"        json:"id"`
	UserID      primitive.ObjectID `bson:"userId"               json:"userId"`
	Word        string             `bson:"word"                 json:"-"` // never sent to frontend
	Guesses     []GuessResult      `bson:"guesses"              json:"guesses"`
	Status      GameStatus         `bson:"status"               json:"status"`
	StartedAt   time.Time          `bson:"startedAt"            json:"startedAt"`
	CompletedAt *time.Time         `bson:"completedAt,omitempty" json:"completedAt,omitempty"`
}
