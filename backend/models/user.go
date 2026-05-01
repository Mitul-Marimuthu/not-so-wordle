// Package models defines the MongoDB document shapes used across the app.
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SolvedEntry records a single completed game in the user's history.
type SolvedEntry struct {
	Word    string    `bson:"word"    json:"word"`
	Date    time.Time `bson:"date"    json:"date"`
	Guesses int       `bson:"guesses" json:"guesses"` // number of guesses it took
}

// User is the main player document stored in the "users" collection.
type User struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	GoogleID      string             `bson:"googleId"      json:"googleId"`
	Email         string             `bson:"email"         json:"email"`
	Name          string             `bson:"name"          json:"name"`
	Avatar        string             `bson:"avatar"        json:"avatar"`
	TotalSolved   int                `bson:"totalSolved"   json:"totalSolved"`
	CurrentStreak int                `bson:"currentStreak" json:"currentStreak"`
	LongestStreak int                `bson:"longestStreak" json:"longestStreak"`
	// SolvedWords is the list of words this player has successfully guessed.
	// It drives the weighted random selection: solved words get a lower weight
	// so fresh words are preferred in future games.
	SolvedWords []string      `bson:"solvedWords" json:"solvedWords"`
	History     []SolvedEntry `bson:"history"     json:"history"`
	CreatedAt   time.Time     `bson:"createdAt"   json:"createdAt"`
}
