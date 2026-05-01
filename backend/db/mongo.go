// Package db manages the single shared MongoDB connection for the app.
package db

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// client and dbName are package-level so every handler can reach them via Collection().
var client *mongo.Client
var dbName string

// Connect opens a connection to Atlas, pings it to confirm it's reachable,
// and stores the client for later use. Call this once at startup.
func Connect(ctx context.Context, uri, name string) error {
	c, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return err
	}
	// Ping ensures the credentials and network path are valid before we serve traffic.
	if err := c.Ping(ctx, nil); err != nil {
		return err
	}
	client = c
	dbName = name
	return nil
}

// Disconnect gracefully closes the connection on server shutdown.
func Disconnect() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client.Disconnect(ctx)
}

// Collection returns a handle to a named collection inside the app database.
// Every handler calls this instead of referencing the client directly.
func Collection(name string) *mongo.Collection {
	return client.Database(dbName).Collection(name)
}
