import mongoose from 'mongoose';

const WORD_LIST_URL =
  'https://raw.githubusercontent.com/tabatkins/wordle-list/main/words';

const WordSchema = new mongoose.Schema({ word: { type: String, unique: true } });
const Word = mongoose.models.Word ?? mongoose.model('Word', WordSchema);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB ?? 'wordle' });
  console.log('Connected to MongoDB');

  const res = await fetch(WORD_LIST_URL);
  if (!res.ok) throw new Error(`Failed to fetch word list: ${res.status}`);

  const text = await res.text();
  const words = text
    .split('\n')
    .map(w => w.trim().toLowerCase())
    .filter(w => /^[a-z]{5}$/.test(w));

  console.log(`Inserting ${words.length} words…`);

  // insertMany with ordered:false skips duplicates without aborting the batch.
  const docs = words.map(w => ({ word: w }));
  const result = await Word.insertMany(docs, { ordered: false }).catch((err: { insertedDocs?: unknown[] }) => {
    // E11000 duplicate key — still return what was inserted.
    return { insertedCount: err.insertedDocs?.length ?? 0 };
  });

  console.log(`Done. Inserted: ${(result as { insertedCount?: number }).insertedCount ?? words.length}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
