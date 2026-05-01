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
	// Load .env file if present. In production (Railway) the vars are set
	// directly in the environment, so a missing .env is not an error.
	if err := godotenv.Load(".env"); err != nil {
		log.Println("no .env file found, reading from environment")
	}

	// SetupOAuth reads GOOGLE_CLIENT_ID / SECRET from env, so it must run
	// after godotenv.Load — not in an init() function.
	handlers.SetupOAuth()

	// Connect to MongoDB Atlas and verify the connection before serving.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.Connect(ctx, os.Getenv("MONGODB_URI"), os.Getenv("MONGODB_DB")); err != nil {
		log.Fatalf("MongoDB connection failed: %v", err)
	}
	defer db.Disconnect()
	log.Println("Connected to MongoDB.")

	r := chi.NewRouter()

	// Logger prints each request method + path + status + duration.
	r.Use(chimw.Logger)
	// Recoverer catches panics and returns a 500 instead of crashing the server.
	r.Use(chimw.Recoverer)
	// CORS allows the frontend origin to call this API.
	// AllowedOrigins is set to FRONTEND_URL so other domains are blocked.
	r.Use(cors.New(cors.Options{
		AllowedOrigins:   []string{os.Getenv("FRONTEND_URL")},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}).Handler)

	// Public routes — no JWT required.
	r.Get("/auth/google", handlers.GoogleLogin)
	r.Get("/auth/google/callback", handlers.GoogleCallback)

	// Protected routes — RequireAuth middleware validates the JWT on every request
	// and injects the user ID into the request context.
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
		port = "8080" // default for local development
	}
	log.Printf("Server listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
