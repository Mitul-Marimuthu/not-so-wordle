import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { connectDB } from '@/lib/db';
import Word from '@/lib/models/Word';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  await connectDB();
  const docs = await Word.find({}, 'word').lean() as { word: string }[];
  return Response.json({ words: docs.map(d => d.word) });
}
