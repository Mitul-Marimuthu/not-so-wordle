import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// Delegates all /api/auth/* requests to NextAuth.
// This covers: sign-in, sign-out, callback, session, CSRF token, etc.
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
