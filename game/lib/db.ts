import mongoose from 'mongoose';

// Cache the connection across hot-reloads in development and across
// warm invocations in production (Vercel Fluid Compute reuses instances).
const cache: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } = {
  conn: null,
  promise: null,
};

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(process.env.MONGODB_URI!, {
      dbName: process.env.MONGODB_DB ?? 'wordle',
      bufferCommands: false,
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
