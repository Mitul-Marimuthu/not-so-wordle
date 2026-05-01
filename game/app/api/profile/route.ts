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

  // Omit solvedWords — it's a large internal array the UI doesn't need.
  const user = await User.findById(session.user.id).select('-solvedWords');
  if (!user) return Response.json({ error: 'user not found' }, { status: 404 });

  return Response.json(user);
}
