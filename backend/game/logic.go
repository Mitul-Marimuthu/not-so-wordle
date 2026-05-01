// Package game contains the core Wordle logic: guess evaluation and word selection.
package game

import (
	"context"
	"fmt"
	"math/rand"

	"go.mongodb.org/mongo-driver/bson"
	"wordle/backend/db"
	"wordle/backend/models"
)

// EvaluateGuess compares a 5-letter guess against the target word and returns
// a 5-element result slice:
//
//	"+" = correct letter, correct position (green)
//	"x" = correct letter, wrong position   (yellow)
//	"-" = letter not in word               (gray)
//
// Two-pass approach handles duplicates correctly.
// Example: guess "SPEED", target "SPELL" → only one E should light up.
func EvaluateGuess(guess, target string) []string {
	result := make([]string, 5)
	// remaining tracks how many times each target letter is still "available"
	// to be matched as yellow after greens have been claimed.
	remaining := make(map[rune]int)

	// Pass 1: mark greens and count the leftover target letters.
	for i, ch := range target {
		if rune(guess[i]) == ch {
			result[i] = "+"
		} else {
			remaining[ch]++
		}
	}

	// Pass 2: for non-green positions, check if the guessed letter still
	// exists in the remaining pool (yellow), otherwise gray.
	for i, ch := range guess {
		if result[i] == "+" {
			continue // already settled in pass 1
		}
		if remaining[ch] > 0 {
			result[i] = "x"
			remaining[ch]-- // consume one occurrence so duplicates don't over-count
		} else {
			result[i] = "-"
		}
	}

	return result
}

// SelectWord picks a word for the player using weighted random sampling.
//
// Words the player has NOT solved yet → weight 1.0 (preferred)
// Words the player HAS already solved → weight 0.1 (can still appear, but rarely)
//
// This means a player will almost always see new words first, but previously
// solved words slowly cycle back in once the fresh pool shrinks.
func SelectWord(ctx context.Context, solvedWords []string) (string, error) {
	// Build a set for O(1) lookups when assigning weights.
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

	// Assign weights and accumulate the total for the sampling step.
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

	// Weighted reservoir: pick a random point on [0, total) and walk the pool
	// until we cross it. This gives each word a probability proportional to its weight.
	r := rand.Float64() * total
	for _, e := range pool {
		r -= e.weight
		if r <= 0 {
			return e.word, nil
		}
	}
	// Floating-point rounding can leave r just above 0 at the end; fall back to last entry.
	return pool[len(pool)-1].word, nil
}
