import mongoose, { Schema, Document } from 'mongoose';

export interface IWord extends Document {
  word: string;
}

const WordSchema = new Schema<IWord>({
  word: { type: String, required: true, unique: true },
});

// Seeded once via `npx tsx --env-file=.env.local scripts/seed.ts`
export default (mongoose.models.Word as mongoose.Model<IWord>) ||
  mongoose.model<IWord>('Word', WordSchema);
