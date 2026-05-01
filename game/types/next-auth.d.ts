import { DefaultSession } from 'next-auth';

// Extend the built-in session/JWT types so TypeScript knows about our custom fields.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string; // MongoDB ObjectId as string
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    mongoId?: string;
  }
}
