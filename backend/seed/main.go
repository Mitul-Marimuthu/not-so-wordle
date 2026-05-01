// Seed populates the MongoDB words collection from the tabatkins/wordle-list
// word list. Run once from the backend/ directory:
//
//	go run ./seed
//
// Safe to re-run: it drops and recreates the collection each time.
package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// wordListURL is the original Wordle valid-guess list maintained by tabatkins.
// Plain text, one lowercase 5-letter word per line, ~8 000 words.
const wordListURL = "https://raw.githubusercontent.com/tabatkins/wordle-list/main/words"

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

	// Download the plain-text word list from GitHub at runtime.
	resp, err := http.Get(wordListURL)
	if err != nil {
		log.Fatal("fetch word list:", err)
	}
	defer resp.Body.Close()

	// Read one word per line, skip blank lines.
	var docs []interface{}
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		word := strings.TrimSpace(scanner.Text())
		if word == "" {
			continue
		}
		docs = append(docs, bson.M{"word": word})
	}
	if err := scanner.Err(); err != nil {
		log.Fatal("scan word list:", err)
	}
	fmt.Printf("Fetched %d words.\n", len(docs))

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
