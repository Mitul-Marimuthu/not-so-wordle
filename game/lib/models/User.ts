import mongoose, { Schema, Document } from 'mongoose';

export interface SolvedEntry {
  word: string;
  date: Date;
  guesses: number;
}

export interface IUser extends Document {
  googleId: string;
  email: string;
  name: string;
  totalSolved: number;
  currentStreak: number;
  longestStreak: number;
  solvedWords: string[];
  history: SolvedEntry[];
  createdAt: Date;
}

const SolvedEntrySchema = new Schema<SolvedEntry>(
  { word: String, date: Date, guesses: Number },
  { _id: false }
);

const UserSchema = new Schema<IUser>({
  googleId:      { type: String, required: true, unique: true },
  email:         { type: String, required: true },
  name:          { type: String, required: true },
  totalSolved:   { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  // solvedWords drives weighted word selection — solved words get lower weight.
  solvedWords:   { type: [String], default: [] },
  history:       { type: [SolvedEntrySchema], default: [] },
  createdAt:     { type: Date, default: Date.now },
});

// Prevent model re-compilation on hot reload in development.
export default (mongoose.models.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>('User', UserSchema);
