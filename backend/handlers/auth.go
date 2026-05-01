package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"wordle/backend/db"
	"wordle/backend/models"
)

var oauthConfig *oauth2.Config

// SetupOAuth must be called after environment variables are loaded.
func SetupOAuth() {
	oauthConfig = &oauth2.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

// GoogleLogin redirects the user to Google's OAuth consent screen.
func GoogleLogin(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)

	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		MaxAge:   300,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   os.Getenv("ENV") == "production",
	})

	http.Redirect(w, r, oauthConfig.AuthCodeURL(state, oauth2.AccessTypeOnline), http.StatusTemporaryRedirect)
}

type googleUserInfo struct {
	Sub     string `json:"sub"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	Picture string `json:"picture"`
}

// GoogleCallback handles the redirect from Google, upserts the user, and
// issues a JWT redirected to the frontend as ?token=<jwt>.
func GoogleCallback(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("oauth_state")
	if err != nil || cookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}

	token, err := oauthConfig.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "token exchange failed", http.StatusInternalServerError)
		return
	}

	resp, err := oauthConfig.Client(r.Context(), token).Get("https://www.googleapis.com/oauth2/v3/userinfo")
	if err != nil {
		http.Error(w, "failed to fetch user info", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var info googleUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		http.Error(w, "failed to decode user info", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	filter := bson.M{"googleId": info.Sub}
	update := bson.M{
		"$set": bson.M{
			"email":  info.Email,
			"name":   info.Name,
			"avatar": info.Picture,
		},
		"$setOnInsert": bson.M{
			"googleId":      info.Sub,
			"totalSolved":   0,
			"currentStreak": 0,
			"longestStreak": 0,
			"solvedWords":   []string{},
			"history":       []models.SolvedEntry{},
			"createdAt":     time.Now(),
		},
	}
	opts := options.FindOneAndUpdate().
		SetUpsert(true).
		SetReturnDocument(options.After)

	var user models.User
	if err := db.Collection("users").FindOneAndUpdate(ctx, filter, update, opts).Decode(&user); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	// Ensure the ObjectID is set (needed for upsert-created docs)
	if user.ID == primitive.NilObjectID {
		db.Collection("users").FindOne(ctx, filter).Decode(&user)
	}

	jwtToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": user.ID.Hex(),
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	})
	signed, err := jwtToken.SignedString([]byte(os.Getenv("JWT_SECRET")))
	if err != nil {
		http.Error(w, "failed to sign token", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, fmt.Sprintf("%s?token=%s", os.Getenv("FRONTEND_URL"), signed), http.StatusTemporaryRedirect)
}
