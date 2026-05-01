import mongoose, { Schema, Document, Types } from 'mongoose';

export type GameStatus = 'in_progress' | 'won' | 'lost';

export interface GuessEntry {
  guess: string;
  result: string[]; // ["+" | "x" | "-", ...]
  timestamp: Date;
}

export interface IGame extends Document {
  userId: Types.ObjectId;
  word: string; // never sent to the client
  guesses: GuessEntry[];
  status: GameStatus;
  startedAt: Date;
  completedAt?: Date;
}

const GuessEntrySchema = new Schema<GuessEntry>(
  { guess: String, result: [String], timestamp: Date },
  { _id: false }
);

const GameSchema = new Schema<IGame>({
  userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  word:        { type: String, required: true },
  guesses:     { type: [GuessEntrySchema], default: [] },
  status:      { type: String, enum: ['in_progress', 'won', 'lost'], default: 'in_progress' },
  startedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date },
});

export default (mongoose.models.Game as mongoose.Model<IGame>) ||
  mongoose.model<IGame>('Game', GameSchema);
