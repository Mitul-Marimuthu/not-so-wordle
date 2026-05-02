import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { connectDB } from '@/lib/db';
import Game from '@/lib/models/Game';
import User from '@/lib/models/User';
import Word from '@/lib/models/Word';
import { selectWord } from '@/lib/game';
import mongoose from 'mongoose';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  await connectDB();
  const userId = new mongoose.Types.ObjectId(session.user.id);

  // Fast path: return existing in-progress game without touching word list.
  // Sort by startedAt desc so all devices consistently land on the same game.
  const existing = await Game.findOne({ userId, status: 'in_progress' }).sort({ startedAt: -1 });
  if (existing) {
    return Response.json({ gameId: existing._id.toString(), status: existing.status });
  }

  // Fetch user's solved words so selectWord can weight fresh words higher.
  const [user, allWords] = await Promise.all([
    User.findById(userId).select('solvedWords'),
    Word.find({}, 'word').lean() as Promise<{ word: string }[]>,
  ]);

  if (allWords.length === 0) {
    return Response.json({ error: 'word list is empty — run the seed script' }, { status: 500 });
  }

  const word = selectWord(allWords.map(w => w.word), user?.solvedWords ?? []);

  // Atomic upsert — if two requests race past the fast-path check above,
  // $setOnInsert ensures only one document is ever created.
  const game = await Game.findOneAndUpdate(
    { userId, status: 'in_progress' },
    {
      $setOnInsert: {
        userId,
        word,
        guesses: [],
        status: 'in_progress',
        startedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  return Response.json({ gameId: game._id.toString(), status: game.status });
}
