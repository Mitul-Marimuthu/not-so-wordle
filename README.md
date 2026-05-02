# Definitely Not Wordle

A fullstack Wordle clone with unlimited play, user profiles, streaks, and a global leaderboard.

GitHub: https://github.com/Mitul-Marimuthu/not-so-wordle

---

## Tech Stack

### Frontend + Backend — Next.js (TypeScript) on Vercel
Everything lives in a single Next.js App Router project. The React UI handles the board, keyboard, and animations. Game logic runs in Next.js API routes - no separate backend server. Tailwind CSS handles layout and styling. The game never sees the target word - only tile color results come back from the API.

### Auth — NextAuth.js v4 with Google OAuth
NextAuth handles the full OAuth flow. On first sign-in, a user document is created in MongoDB and the MongoDB `_id` is embedded in the JWT. Every API route calls `getServerSession()` to authenticate the request — no manual token passing required.

### Database — MongoDB Atlas with Mongoose
Two features:
- **Word storage**: all valid 5-letter words seeded once from [https://raw.githubusercontent.com/Kinkelin/WordleCompetition/main/data/official/official_allowed_guesses.txt] and
[https://raw.githubusercontent.com/Kinkelin/WordleCompetition/main/data/official/shuffled_real_wordles.txt]
- **Player records**: profiles, game history, streaks

---

## MongoDB Collections

### `words`
Seeded once from the [tabatkins/wordle-list](https://github.com/tabatkins/wordle-list) repository — the original Wordle valid-guess list extracted from the NYT source code (~8,000 words).

```json
{ "word": "crane" }
```

### `users`
One document per authenticated player. `solvedWords` drives weighted word selection.

```json
{
  "googleId": "...",
  "email": "user@example.com",
  "name": "Jane Doe",
  "totalSolved": 42,
  "currentStreak": 5,
  "longestStreak": 12,
  "solvedWords": ["crane", "stove", "plumb"],
  "history": [
    { "word": "crane", "date": "...", "guesses": 3 }
  ]
}
```

### `games`
One document per game session. `word` is never sent to the client.

```json
{
  "userId": "...",
  "word": "crane",
  "guesses": [
    { "guess": "stone", "result": ["x", "+", "-", "+", "+"], "timestamp": "..." }
  ],
  "status": "in_progress",
  "startedAt": "..."
}
```

Result codes: `+` = correct position (green), `x` = correct letter wrong position (yellow), `-` = not in word (gray).

---

## API Routes

All routes are Next.js API routes under `game/app/api/`. Authentication is enforced via `getServerSession(authOptions)` — unauthenticated requests get a `401`.

### Auth (NextAuth)

| Method | Route | Description |
|--------|-------|-------------|
| `GET/POST` | `/api/auth/[...nextauth]` | NextAuth catch-all: handles OAuth redirect, callback, session, and sign-out |

### Games

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/games/new` | Returns an existing in-progress game or creates a new one using weighted word selection. The target word is never returned. |
| `POST` | `/api/games/[id]/guess` | Validates the guess is in the word list, evaluates tile colors, persists the result, and updates user stats on win/loss. |
| `GET` | `/api/games/[id]` | Returns game state (guesses, status) without the target word — used to restore a game after page refresh. |

### Profile

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/profile` | Returns the authenticated user's stats and full game history. Omits `solvedWords` (internal array the UI doesn't need). |

### Leaderboard

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/leaderboard/streak` | Top 10 players by `longestStreak`. |
| `GET` | `/api/leaderboard/total` | Top 10 players by `totalSolved`. |

---

## Design Decisions

### Unlimited Play (not daily)
The original Wordle gives one word per day. Unlimited play demonstrates more fullstack depth: session management, per-user state, weighted selection, and a leaderboard that grows over time.

### Word List: Self-Hosted in MongoDB
Words from [tabatkins/wordle-list](https://github.com/tabatkins/wordle-list) are seeded into MongoDB once via `game/scripts/seed.ts`. This means zero external API dependencies at runtime — no keys, no rate limits, no third-party outage risk.

```
npx tsx --env-file=.env.local scripts/seed.ts
```

### Weighted Word Selection
When a player starts a new game, a word is picked using weighted random sampling:
- Words the player **has not yet solved** → weight `1.0`
- Words the player **has already solved** → weight `0.1`

Players encounter fresh words first, while old words can still reappear occasionally. The logic lives in `game/lib/game.ts` (`selectWord`).

### Guess Evaluation: Two-Pass Algorithm
The green/yellow/gray computation handles the duplicate-letter edge case correctly (e.g. guessing `SPEED` against `SPELL`). Pass 1 locks in greens, pass 2 assigns yellows only for letters with remaining unmatched occurrences in the target. Lives in `game/lib/game.ts` (`evaluateGuess`).

### Streak = Consecutive Wins
Since play is not tied to a calendar day, streak is defined as consecutive games won without a loss. A streak resets on any loss. More skill-reflective than a daily streak.

### Single Vercel Deployment
The entire project — React UI, API routes, OAuth flow, DB calls — deploys as one Next.js app on Vercel. No separate backend service or Railway deployment needed. NextAuth's cookie-based sessions replace the hand-rolled JWT the original Go backend issued.

---

## Project Structure

```
wordle/
└── game/                  # Next.js — deployed to Vercel
    ├── app/
    │   ├── api/
    │   │   ├── auth/[...nextauth]/   # NextAuth catch-all
    │   │   ├── games/
    │   │   │   ├── new/              # POST: start game
    │   │   │   └── [id]/
    │   │   │       ├── route.ts      # GET: game state
    │   │   │       └── guess/        # POST: submit guess
    │   │   ├── profile/              # GET: user stats
    │   │   └── leaderboard/[type]/   # GET: top 10
    │   ├── leaderboard/
    │   ├── profile/
    │   └── page.tsx                  # Main game page
    ├── components/
    ├── lib/
    │   ├── auth-options.ts           # NextAuth config
    │   ├── db.ts                     # Mongoose connection
    │   ├── game.ts                   # evaluateGuess, selectWord
    │   └── models/                   # User, Game, Word schemas
    ├── scripts/
    │   └── seed.ts                   # One-time word import
    └── types/
        └── next-auth.d.ts            # Session type augmentation
```

---

## Environment Variables

Create `game/.env.local` with:

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random string>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
MONGODB_DB=wordle
```

On Vercel, set these in the project's Environment Variables dashboard. Set `NEXTAUTH_URL` to your production URL.
