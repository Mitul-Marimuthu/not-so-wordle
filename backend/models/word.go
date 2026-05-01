package models

import "go.mongodb.org/mongo-driver/bson/primitive"

// Word is one document in the "words" collection.
// The collection is seeded once from goodWords.json (see seed/main.go)
// and never written to again at runtime.
type Word struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Word         string             `bson:"word"          json:"word"`
	Definition   string             `bson:"definition"    json:"definition"`
	PartOfSpeech string             `bson:"partOfSpeech"  json:"partOfSpeech"`
}
