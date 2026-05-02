# Definitely Not Wordle

Unlimited Wordle with persistent stats, streaks, and a global leaderboard. Built with Next.js, NextAuth (Google OAuth), and MongoDB Atlas.

## Stack

- **Next.js 15** (App Router) — frontend + API routes
- **NextAuth v4** — Google OAuth, JWT sessions
- **MongoDB Atlas + Mongoose** — game state, user profiles, word list
- **Vercel** — deployment

## Local setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment variables**

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `NEXTAUTH_URL` | `http://localhost:3000` locally |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console OAuth 2.0 credentials |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB` | Database name (default: `not-so-wordle`) |

**3. Google Cloud Console**

Add these to your OAuth 2.0 client's authorized redirect URIs:
- `http://localhost:3000/api/auth/callback/google` (local)
- `https://your-domain.vercel.app/api/auth/callback/google` (production)

**4. Seed the word list**

The seed script fetches the official Wordle allowed-guesses list (~10,600 words) from [Kinkelin/WordleCompetition](https://github.com/Kinkelin/WordleCompetition) and inserts any new words into MongoDB (skips duplicates, safe to re-run).

```bash
MONGODB_URI=<your-uri> MONGODB_DB=<your-db> npx tsx scripts/seed.ts
```

Or if your `.env.local` is already set:

```bash
npx dotenv -e .env.local -- npx tsx scripts/seed.ts
```

**5. Run the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment (Vercel)

1. Push to GitHub and import the repo in Vercel
2. Set the same environment variables from `.env.local` in Vercel's project settings (use your production URL for `NEXTAUTH_URL`)
3. The seed script runs locally against Atlas — no build-time seeding needed
