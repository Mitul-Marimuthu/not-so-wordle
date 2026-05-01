package db

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var client *mongo.Client
var dbName string

func Connect(ctx context.Context, uri, name string) error {
	c, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return err
	}
	if err := c.Ping(ctx, nil); err != nil {
		return err
	}
	client = c
	dbName = name
	return nil
}

func Disconnect() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client.Disconnect(ctx)
}

func Collection(name string) *mongo.Collection {
	return client.Database(dbName).Collection(name)
}
