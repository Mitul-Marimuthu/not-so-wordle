import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { connectDB } from '@/lib/db';
import Game from '@/lib/models/Game';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  // Exclude the `word` field — the answer never leaves the server.
  const game = await Game.findOne({ _id: id, userId: session.user.id }).select('-word');
  if (!game) return Response.json({ error: 'game not found' }, { status: 404 });

  return Response.json({
    id: game._id.toString(),
    guesses: game.guesses,
    status: game.status,
    startedAt: game.startedAt,
  });
}
