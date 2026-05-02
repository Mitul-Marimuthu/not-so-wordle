import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  await connectDB();

  const user = await User.findById(session.user.id)
    .select('name email totalSolved currentStreak longestStreak history')
    .lean();
  if (!user) return Response.json({ error: 'user not found' }, { status: 404 });

  return Response.json(user);
}
