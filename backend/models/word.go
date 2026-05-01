package models

import "go.mongodb.org/mongo-driver/bson/primitive"

type Word struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Word         string             `bson:"word"          json:"word"`
	Definition   string             `bson:"definition"    json:"definition"`
	PartOfSpeech string             `bson:"partOfSpeech"  json:"partOfSpeech"`
}
