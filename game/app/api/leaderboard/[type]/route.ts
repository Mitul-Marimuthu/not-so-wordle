import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { type } = await params;
  // Map the URL segment to the actual Mongoose field name.
  const field = type === 'total' ? 'totalSolved' : 'longestStreak';

  await connectDB();

  const users = await User.find({})
    .sort({ [field]: -1 })
    .limit(10)
    .select(`name ${field}`);

  const leaderboard = users.map((u, i) => ({
    rank: i + 1,
    name: u.name,
    score: u[field as keyof typeof u],
  }));

  return Response.json({ leaderboard });
}
