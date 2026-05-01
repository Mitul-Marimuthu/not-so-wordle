import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { connectDB } from '@/lib/db';
import Game from '@/lib/models/Game';
import User from '@/lib/models/User';
import Word from '@/lib/models/Word';
import { evaluateGuess } from '@/lib/game';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const guess: string = body.guess?.toLowerCase().trim() ?? '';

  if (guess.length !== 5) {
    return Response.json({ error: 'guess must be exactly 5 letters' }, { status: 400 });
  }

  await connectDB();

  // Verify ownership before doing anything else.
  const game = await Game.findOne({ _id: id, userId: session.user.id });
  if (!game) return Response.json({ error: 'game not found' }, { status: 404 });
  if (game.status !== 'in_progress') {
    return Response.json({ error: 'game already finished' }, { status: 409 });
  }

  // Reject guesses not in the word list — same rule as the real Wordle.
  const wordExists = await Word.exists({ word: guess });
  if (!wordExists) {
    return Response.json({ error: 'not a valid word' }, { status: 422 });
  }

  const result = evaluateGuess(guess, game.word);
  const won = guess === game.word;
  const lost = !won && game.guesses.length + 1 >= 6;
  const status = won ? 'won' : lost ? 'lost' : 'in_progress';
  const now = new Date();

  // Persist the guess and any status change.
  game.guesses.push({ guess, result, timestamp: now });
  game.status = status;
  if (status !== 'in_progress') game.completedAt = now;
  await game.save();

  // Update player stats now that the game outcome is decided.
  if (won) {
    const user = await User.findById(session.user.id);
    if (user) {
      const newStreak = user.currentStreak + 1;
      await User.findByIdAndUpdate(session.user.id, {
        $inc:      { totalSolved: 1 },
        $set:      { currentStreak: newStreak, longestStreak: Math.max(user.longestStreak, newStreak) },
        $addToSet: { solvedWords: game.word }, // $addToSet avoids duplicates
        $push:     { history: { word: game.word, date: now, guesses: game.guesses.length } },
      });
    }
  } else if (lost) {
    // Streak resets to 0 on any loss.
    await User.findByIdAndUpdate(session.user.id, { $set: { currentStreak: 0 } });
  }

  const resp: Record<string, unknown> = {
    result,
    status,
    guessNumber: game.guesses.length,
  };
  // Only reveal the answer once the game is over.
  if (status !== 'in_progress') resp.word = game.word;

  return Response.json(resp);
}
