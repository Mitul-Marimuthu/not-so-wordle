// Package handlers contains all HTTP handler functions registered on the router.
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

// SetupOAuth initialises the Google OAuth2 client. It must be called after
// godotenv.Load() so that the environment variables are already set.
func SetupOAuth() {
	oauthConfig = &oauth2.Config{
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"), // must match the URI registered in Google Cloud Console
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

// GoogleLogin starts the OAuth flow by redirecting the browser to Google's
// consent screen. A random state token is stored in a short-lived cookie to
// prevent CSRF attacks on the callback.
func GoogleLogin(w http.ResponseWriter, r *http.Request) {
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)

	// Store state in an httpOnly cookie so the callback can verify it.
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		MaxAge:   300, // 5 minutes — plenty of time to complete the OAuth flow
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   os.Getenv("ENV") == "production",
	})

	http.Redirect(w, r, oauthConfig.AuthCodeURL(state, oauth2.AccessTypeOnline), http.StatusTemporaryRedirect)
}

// googleUserInfo is the subset of fields we care about from Google's userinfo endpoint.
type googleUserInfo struct {
	Sub     string `json:"sub"`     // Google's stable unique user ID
	Name    string `json:"name"`
	Email   string `json:"email"`
	Picture string `json:"picture"`
}

// GoogleCallback handles the redirect back from Google after the user grants access.
// It: verifies state → exchanges code for token → fetches user info →
// upserts the user in MongoDB → issues a JWT → redirects to the frontend.
func GoogleCallback(w http.ResponseWriter, r *http.Request) {
	// Verify the state matches what we stored in the cookie (CSRF protection).
	cookie, err := r.Cookie("oauth_state")
	if err != nil || cookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}

	// Exchange the one-time authorisation code for an access token.
	token, err := oauthConfig.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "token exchange failed", http.StatusInternalServerError)
		return
	}

	// Use the access token to call Google's userinfo endpoint.
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

	// Upsert the user: update name/email/avatar on every login,
	// but only set default stats on the very first login ($setOnInsert).
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
		SetReturnDocument(options.After) // return the doc as it looks after the update

	var user models.User
	if err := db.Collection("users").FindOneAndUpdate(ctx, filter, update, opts).Decode(&user); err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	// On the very first upsert the returned doc may not have _id set; re-fetch to be safe.
	if user.ID == primitive.NilObjectID {
		db.Collection("users").FindOne(ctx, filter).Decode(&user)
	}

	// Issue a signed JWT that the frontend will include as "Authorization: Bearer <token>"
	// on every subsequent API request. Expires in 7 days.
	jwtToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": user.ID.Hex(), // MongoDB ObjectID as the subject
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	})
	signed, err := jwtToken.SignedString([]byte(os.Getenv("JWT_SECRET")))
	if err != nil {
		http.Error(w, "failed to sign token", http.StatusInternalServerError)
		return
	}

	// Send the token to the frontend via query param. The frontend stores it
	// in localStorage and attaches it to every API call as a Bearer token.
	http.Redirect(w, r, fmt.Sprintf("%s?token=%s", os.Getenv("FRONTEND_URL"), signed), http.StatusTemporaryRedirect)
}
