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

  // Return the existing in-progress game rather than creating a duplicate.
  const existing = await Game.findOne({ userId, status: 'in_progress' });
  if (existing) {
    return Response.json({ gameId: existing._id.toString(), status: existing.status });
  }

  // Fetch user's solved words so SelectWord can weight fresh words higher.
  const user = await User.findById(userId).select('solvedWords');
  const allWords = await Word.find({}, 'word').lean() as { word: string }[];

  if (allWords.length === 0) {
    return Response.json({ error: 'word list is empty — run the seed script' }, { status: 500 });
  }

  const word = selectWord(allWords.map(w => w.word), user?.solvedWords ?? []);

  const game = await Game.create({
    userId,
    word, // stored in DB, never returned to the client
    guesses: [],
    status: 'in_progress',
    startedAt: new Date(),
  });

  return Response.json({ gameId: game._id.toString(), status: game.status });
}
