package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"github.com/rs/cors"

	"wordle/backend/db"
	"wordle/backend/handlers"
	authmw "wordle/backend/middleware"
)

func main() {
	if err := godotenv.Load(".env"); err != nil {
		log.Println("no .env file found, reading from environment")
	}

	// SetupOAuth must run after env vars are loaded
	handlers.SetupOAuth()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.Connect(ctx, os.Getenv("MONGODB_URI"), os.Getenv("MONGODB_DB")); err != nil {
		log.Fatalf("MongoDB connection failed: %v", err)
	}
	defer db.Disconnect()
	log.Println("Connected to MongoDB.")

	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.New(cors.Options{
		AllowedOrigins:   []string{os.Getenv("FRONTEND_URL")},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}).Handler)

	// Auth (public)
	r.Get("/auth/google", handlers.GoogleLogin)
	r.Get("/auth/google/callback", handlers.GoogleCallback)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authmw.RequireAuth)
		r.Post("/api/games/new", handlers.NewGame)
		r.Post("/api/games/{id}/guess", handlers.SubmitGuess)
		r.Get("/api/games/{id}", handlers.GetGame)
		r.Get("/api/profile", handlers.GetProfile)
		r.Get("/api/leaderboard/streak", handlers.LeaderboardStreak)
		r.Get("/api/leaderboard/total", handlers.LeaderboardTotal)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
