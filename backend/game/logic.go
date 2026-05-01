package game

import (
	"context"
	"fmt"
	"math/rand"

	"go.mongodb.org/mongo-driver/bson"
	"wordle/backend/db"
	"wordle/backend/models"
)

// EvaluateGuess returns a 5-element result slice:
//
//	"+" = correct letter, correct position (green)
//	"x" = correct letter, wrong position   (yellow)
//	"-" = letter not in word               (gray)
//
// Handles duplicate letters correctly: a letter is only marked "x" as many
// times as it appears in the target (minus any "+" hits).
func EvaluateGuess(guess, target string) []string {
	result := make([]string, 5)
	remaining := make(map[rune]int)

	// First pass: greens
	for i, ch := range target {
		if rune(guess[i]) == ch {
			result[i] = "+"
		} else {
			remaining[ch]++
		}
	}

	// Second pass: yellows and grays
	for i, ch := range guess {
		if result[i] == "+" {
			continue
		}
		if remaining[ch] > 0 {
			result[i] = "x"
			remaining[ch]--
		} else {
			result[i] = "-"
		}
	}

	return result
}

// SelectWord picks a weighted-random word for the player.
// Words the player has not yet solved have weight 1.0.
// Words they have already solved have weight 0.1, so they can still appear
// but only after exhausting the fresh pool.
func SelectWord(ctx context.Context, solvedWords []string) (string, error) {
	solvedSet := make(map[string]bool, len(solvedWords))
	for _, w := range solvedWords {
		solvedSet[w] = true
	}

	cursor, err := db.Collection("words").Find(ctx, bson.M{})
	if err != nil {
		return "", err
	}
	defer cursor.Close(ctx)

	var words []models.Word
	if err := cursor.All(ctx, &words); err != nil {
		return "", err
	}
	if len(words) == 0 {
		return "", fmt.Errorf("word collection is empty")
	}

	type entry struct {
		word   string
		weight float64
	}

	pool := make([]entry, 0, len(words))
	total := 0.0
	for _, w := range words {
		wt := 1.0
		if solvedSet[w.Word] {
			wt = 0.1
		}
		pool = append(pool, entry{w.Word, wt})
		total += wt
	}

	r := rand.Float64() * total
	for _, e := range pool {
		r -= e.weight
		if r <= 0 {
			return e.word, nil
		}
	}
	return pool[len(pool)-1].word, nil
}
