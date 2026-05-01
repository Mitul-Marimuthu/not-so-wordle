import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    // Runs on first sign-in (when `account` is present) and on every token refresh.
    async jwt({ token, account, profile }) {
      if (account?.provider === 'google') {
        // First login — upsert the user and stash their MongoDB _id in the JWT
        // so we don't need a DB lookup on every authenticated request.
        await connectDB();
        const p = profile as { email?: string; name?: string };
        const user = await User.findOneAndUpdate(
          { googleId: account.providerAccountId },
          {
            $set: { email: p.email, name: p.name },
            $setOnInsert: {
              googleId: account.providerAccountId,
              totalSolved: 0,
              currentStreak: 0,
              longestStreak: 0,
              solvedWords: [],
              history: [],
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );
        token.mongoId = user._id.toString();
      }
      return token;
    },
    // Exposes the MongoDB _id to client-side useSession() as session.user.id.
    async session({ session, token }) {
      if (token.mongoId) session.user.id = token.mongoId as string;
      return session;
    },
  },
};
