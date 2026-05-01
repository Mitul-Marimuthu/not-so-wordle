// Seed populates the MongoDB words collection from the rypmaloney/wordle-api
// word list. Run once from the backend/ directory:
//
//	go run ./seed
//
// Safe to re-run: it drops and recreates the collection each time.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// wordListURL points to the raw JSON file in the rypmaloney/wordle-api repo.
// All words in this file are already exactly 5 letters.
const wordListURL = "https://raw.githubusercontent.com/rypmaloney/wordle-api/main/lists/goodWords.json"

type definition struct {
	Definition   string `json:"definition"`
	PartOfSpeech string `json:"partOfSpeech"`
}

type rawWord struct {
	Word        string       `json:"word"`
	Definitions []definition `json:"definitions"`
}

func main() {
	// Load .env from the backend/ directory (where this command is run from).
	if err := godotenv.Load(".env"); err != nil {
		log.Println("no .env file found, reading from environment")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(os.Getenv("MONGODB_URI")))
	if err != nil {
		log.Fatal("mongo connect:", err)
	}
	defer client.Disconnect(ctx)

	if err := client.Ping(ctx, nil); err != nil {
		log.Fatal("mongo ping:", err)
	}
	fmt.Println("Connected to MongoDB.")

	// Download the word list directly from GitHub at runtime.
	resp, err := http.Get(wordListURL)
	if err != nil {
		log.Fatal("fetch word list:", err)
	}
	defer resp.Body.Close()

	var raw []rawWord
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		log.Fatal("decode word list:", err)
	}
	fmt.Printf("Fetched %d words.\n", len(raw))

	// Flatten each word + its first definition into a BSON document.
	docs := make([]interface{}, 0, len(raw))
	for _, rw := range raw {
		def, pos := "", ""
		if len(rw.Definitions) > 0 {
			def = rw.Definitions[0].Definition
			pos = rw.Definitions[0].PartOfSpeech
		}
		docs = append(docs, bson.M{
			"word":         rw.Word,
			"definition":   def,
			"partOfSpeech": pos,
		})
	}

	coll := client.Database(os.Getenv("MONGODB_DB")).Collection("words")

	// Drop first so re-runs are idempotent and don't create duplicates.
	if err := coll.Drop(ctx); err != nil {
		log.Fatal("drop collection:", err)
	}

	result, err := coll.InsertMany(ctx, docs)
	if err != nil {
		log.Fatal("insert:", err)
	}
	fmt.Printf("Inserted %d words into the words collection.\n", len(result.InsertedIDs))

	// A unique index on the word field makes validation queries fast (O(log n))
	// and prevents duplicate entries if the seed is ever modified.
	_, err = coll.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "word", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Fatal("create index:", err)
	}
	fmt.Println("Unique index created on word field. Seed complete.")
}
