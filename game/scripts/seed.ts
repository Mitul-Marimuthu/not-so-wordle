import mongoose from 'mongoose';

// This URL specifically points to the curated ANSWER list (~2,300 words)
const OFFICIAL_ANSWERS_URL = 
  'https://raw.githubusercontent.com/Kinkelin/WordleCompetition/main/data/official/shuffled_real_wordles.txt';
  //'https://gist.githubusercontent.com/cfreshman/3c5fb8b416b233e3c3a99e9d6afb164c/raw/wordle-answers-alphabetical.txt';
// const OFFICIAL_ANSWERS_URL =
//   'https://raw.githubusercontent.com/tabatkins/wordle-list/main/answers';

const WordSchema = new mongoose.Schema({ word: { type: String, unique: true } });
const Word = mongoose.models.Word ?? mongoose.model('Word', WordSchema);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB ?? 'wordle' });
  console.log('Connected to MongoDB');

  // --- STEP 1: CLEAR THE OLD LIST ---
  // console.log('Wiping existing words from database...');
  // await Word.deleteMany({});

  // --- STEP 2: FETCH THE OFFICIAL ANSWERS ---
  console.log('Fetching official Wordle answer list...');
  const res = await fetch(OFFICIAL_ANSWERS_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

  const text = await res.text();
  const words = text
    .split('\n')
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length === 5)
    .filter(w => /^[a-z]+$/.test(w)); // Simple filter, the source is already clean

  console.log(`Inserting ${words.length} official answers…`);

  // --- STEP 3: INSERT ---
  const docs = words.map(w => ({ word: w }));
  
  // Using insertMany with ordered:false as a safety net
  const result = await Word.insertMany(docs, { ordered: false }).catch((err) => {
    return { insertedCount: err.insertedDocs?.length ?? 0 };
  });

  const finalCount = Array.isArray(result) ? result.length : (result.insertedCount ?? 0);
  console.log(`Success! Database now contains ${finalCount} official words.`);
  
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});





// import mongoose from 'mongoose';

// const WORD_LIST_URL =
//   'https://raw.githubusercontent.com/tabatkins/wordle-list/main/words';

// const WordSchema = new mongoose.Schema({ word: { type: String, unique: true } });
// const Word = mongoose.models.Word ?? mongoose.model('Word', WordSchema);

// async function main() {
//   const uri = process.env.MONGODB_URI;
//   if (!uri) throw new Error('MONGODB_URI is not set');

//   await mongoose.connect(uri, { dbName: process.env.MONGODB_DB ?? 'wordle' });
//   console.log('Connected to MongoDB');

//   const res = await fetch(WORD_LIST_URL);
//   if (!res.ok) throw new Error(`Failed to fetch word list: ${res.status}`);

//   const text = await res.text();
//   const words = text
//     .split('\n')
//     .map(w => w.trim().toLowerCase())
//     .filter(w => /^[a-z]{5}$/.test(w));

//   console.log(`Inserting ${words.length} words…`);

//   // insertMany with ordered:false skips duplicates without aborting the batch.
//   const docs = words.map(w => ({ word: w }));
//   const result = await Word.insertMany(docs, { ordered: false }).catch((err: { insertedDocs?: unknown[] }) => {
//     // E11000 duplicate key — still return what was inserted.
//     return { insertedCount: err.insertedDocs?.length ?? 0 };
//   });

//   console.log(`Done. Inserted: ${(result as { insertedCount?: number }).insertedCount ?? words.length}`);
//   await mongoose.disconnect();
// }

// main().catch(err => {
//   console.error(err);
//   process.exit(1);
// });
