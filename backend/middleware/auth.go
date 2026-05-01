// Package middleware provides HTTP middleware for the chi router.
package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// contextKey is a private type so our key never collides with keys from
// other packages that also store values in the request context.
type contextKey string

// UserIDKey is the key under which the authenticated user's MongoDB ObjectID
// (as a hex string) is stored in the request context.
const UserIDKey contextKey = "userID"

// RequireAuth is a middleware that blocks requests without a valid JWT.
// Handlers retrieve the user ID with: r.Context().Value(authmw.UserIDKey).(string)
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(auth, "Bearer ")

		// Parse and verify the token's signature and expiry.
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			// Reject tokens signed with anything other than HMAC (e.g. "alg: none" attacks).
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(os.Getenv("JWT_SECRET")), nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// "sub" is the user's MongoDB ObjectID hex string, set when the JWT was issued.
		userID, ok := claims["sub"].(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Attach the user ID to the context so downstream handlers can use it.
		ctx := context.WithValue(r.Context(), UserIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
