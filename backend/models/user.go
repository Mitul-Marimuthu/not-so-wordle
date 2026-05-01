package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type SolvedEntry struct {
	Word    string    `bson:"word"    json:"word"`
	Date    time.Time `bson:"date"    json:"date"`
	Guesses int       `bson:"guesses" json:"guesses"`
}

type User struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	GoogleID      string             `bson:"googleId"      json:"googleId"`
	Email         string             `bson:"email"         json:"email"`
	Name          string             `bson:"name"          json:"name"`
	Avatar        string             `bson:"avatar"        json:"avatar"`
	TotalSolved   int                `bson:"totalSolved"   json:"totalSolved"`
	CurrentStreak int                `bson:"currentStreak" json:"currentStreak"`
	LongestStreak int                `bson:"longestStreak" json:"longestStreak"`
	SolvedWords   []string           `bson:"solvedWords"   json:"solvedWords"`
	History       []SolvedEntry      `bson:"history"       json:"history"`
	CreatedAt     time.Time          `bson:"createdAt"     json:"createdAt"`
}
