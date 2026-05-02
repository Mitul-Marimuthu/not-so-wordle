# Definitely Not Wordle

Unlimited Wordle with persistent stats, streaks, cross-device sync, and a global leaderboard. Built with Next.js App Router, NextAuth v4 (Google OAuth), and MongoDB Atlas.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | NextAuth v4 — Google OAuth, JWT sessions |
| Database | MongoDB Atlas via Mongoose 9 |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel (serverless) |
| Runtime | React 19, TypeScript 5 |

---

## Architecture overview

All API routes live inside `app/api/` and run as Vercel serverless functions. There is no separate backend. The frontend uses React state and `useSession()` for auth; the game loop communicates exclusively through the REST API described below.

```
app/
  page.tsx              — game UI (board, keyboard, modal)
  profile/page.tsx      — stats + solve history
  leaderboard/page.tsx  — streak / total-solved tabs
  api/
    auth/[...nextauth]/ — NextAuth catch-all
    games/new/          — POST  start or resume a game
    games/[id]/         — GET   fetch game state
    games/[id]/guess/   — POST  submit a guess
    leaderboard/[type]/ — GET   top-10 by streak or total
    profile/            — GET   current user profile
    words/              — GET   full word list for client-side validation
lib/
  auth-options.ts       — NextAuth config + JWT / session callbacks
  auth.ts               — localStorage helpers (game ID persistence)
  db.ts                 — Mongoose connection (singleton, safe for serverless)
  game.ts               — pure game logic: evaluateGuess, selectWord
  api.ts                — typed fetch wrapper for all API routes
  types.ts              — shared TypeScript interfaces
  models/               — Mongoose schemas
scripts/
  seed.ts               — one-time word list import
```

---

## Data models

### User

```
googleId        String   unique — Google provider account ID
email           String
name            String
totalSolved     Number   default 0
currentStreak   Number   default 0 — resets to 0 on any loss
longestStreak   Number   default 0 — all-time high
solvedWords     [String] — drives weighted word selection (see below)
history         [{ word, date, guesses }] — chronological solve log
createdAt       Date
```

Users are created via upsert on first Google sign-in (`findOneAndUpdate` with `$setOnInsert`). The MongoDB `_id` is stashed in the JWT so subsequent requests don't need a User lookup.

### Game

```
userId          ObjectId  ref → User
word            String    — the answer; never sent to the client
guesses         [{ guess, result, timestamp }]
                  result is a 5-element array: "+" correct, "x" present, "-" absent
status          String    "in_progress" | "won" | "lost"
startedAt       Date
completedAt     Date      (set when status changes from in_progress)
```

Only one `in_progress` game can exist per user at a time. This is enforced server-side (see `POST /api/games/new` below).

### Word

```
word    String   unique, lowercase, exactly 5 letters
```

Seeded from the official Wordle allowed-guesses list. The `unique` index means the seed script is safe to re-run — duplicates are skipped silently.

---

## API routes

All routes require an authenticated session (`getServerSession`). Unauthenticated requests get `401`.

### `POST /api/games/new`

Starts a new game or resumes the existing in-progress one.

**Design decisions:**
- Returns the full game state (`gameId`, `status`, `guesses`, `startedAt`) so the client needs only this one call — no follow-up `GET /api/games/:id` needed.
- Fast path: `findOne({ userId, status: 'in_progress' })` returns an existing game immediately without touching the word list.
- New game path: fetches the word list and the user's `solvedWords` in parallel (`Promise.all`), then calls `selectWord()`.
- Atomic upsert: uses `findOneAndUpdate` with `$setOnInsert` instead of `create`. If two requests from different devices race past the `findOne` check simultaneously, MongoDB guarantees exactly one document is created.
- Sorted by `startedAt: -1` so all devices consistently land on the same (most recent) in-progress game if multiple exist.

### `GET /api/games/:id`

Returns the current state of a game.

- Ownership is enforced: `findOne({ _id: id, userId: session.user.id })`.
- The `word` field is excluded while the game is in progress. It is included in the response only once `status !== 'in_progress'`, so the answer is never leaked to the client before the game ends.

### `POST /api/games/:id/guess`

Submits a guess for an in-progress game.

- Validates ownership and that the game is still in progress (returns `409` if already finished).
- Calls `evaluateGuess(guess, game.word)` — a pure, side-effect-free function.
- Detects win/loss, saves the updated game document, then updates player stats atomically via `findByIdAndUpdate`:
  - **Win:** `$inc totalSolved`, `$set currentStreak / longestStreak`, `$addToSet solvedWords` (dedup), `$push history`.
  - **Loss:** `$set currentStreak: 0`.
- Returns `result`, `status`, `guessNumber`, and (if the game is over) `word`.

### `GET /api/leaderboard/:type`

Returns the top 10 users sorted by `longestStreak` (`type=streak`) or `totalSolved` (`type=total`). Only the relevant field and name are selected.

### `GET /api/profile`

Returns the current user's stats and full solve history using `.select()` and `.lean()` for minimal payload.

### `GET /api/words`

Returns the full word list as a flat string array. Fetched once per session and stored in a client-side `Set<string>` for O(1) validation before any guess is submitted.

---

## Game logic (`lib/game.ts`)

### `evaluateGuess(guess, target)`

Two-pass algorithm that handles duplicate letters correctly (matching Wordle's official behavior):

1. **Pass 1** — mark greens (`+`), count leftover letters in the target.
2. **Pass 2** — for non-green positions, consume one occurrence of the letter from the remaining pool: yellow (`x`) if found, gray (`-`) if not.

Example: guessing `SPEED` against `SPELL` — only one `E` lights up yellow because `SPELL` only has one `E` left after the green `P` is matched.

### `selectWord(allWords, solvedWords)`

Weighted random selection:
- Unsolved words → weight `1.0`
- Already-solved words → weight `0.1` (can still appear to avoid infinite loops, but are strongly deprioritized)

Draws from the weighted pool using a single random number against the cumulative weight sum.

---

## Auth (`lib/auth-options.ts`)

- **Strategy:** JWT (no database session table).
- **Sign-in:** `jwt` callback fires with `account` present on first Google login. User is upserted (`findOneAndUpdate` with `$setOnInsert`), and their MongoDB `_id` is stored in the token as `mongoId`.
- **Subsequent requests:** `mongoId` is already in the token — no User lookup needed per request. The `session` callback exposes it as `session.user.id`.
- **Stale sessions:** If a user signed in before `mongoId` was added to the JWT schema, their session won't carry the field and all authenticated routes will return `401`. Fix: sign out and back in.

---

## Word list

The word list is sourced from the official Wordle data extracted and published by the Wordle competition community.

**Current source (active):**
`official_allowed_guesses.txt` from [Kinkelin/WordleCompetition](https://github.com/Kinkelin/WordleCompetition/blob/main/data/official/official_allowed_guesses.txt)
→ ~10,600 valid 5-letter words. This is the full list of words Wordle accepts as valid guesses — a superset of the answer list. Using the full allowed list rather than the ~2,309 curated answers makes the word bank much larger and words less predictable.

**Considered but not used:**
- `shuffled_real_wordles.txt` (same repo) — the ~2,309 official NYT answer words in shuffled order. A smaller, more curated set; words would be more familiar but the bank would exhaust quickly for frequent players.
- `cfreshman/wordle-answers-alphabetical.txt` — an earlier community-maintained answers list, predating the NYT acquisition.
- `tabatkins/wordle-list` — another community mirror.

The seed script normalises everything to lowercase, filters to exactly 5 alphabetic characters, and uses `insertMany` with `ordered: false` so duplicate-key errors on re-runs skip silently without aborting the batch.

---

## Frontend design decisions

### Input locking (dual-lock pattern)

Preventing double-submission required two independent locks:
- `isRevealingRef` — a `useRef` that is checked synchronously inside the `keydown` event handler. State updates don't propagate fast enough to block a second keypress arriving in the same event loop tick.
- `inputLocked` state — disables the on-screen Enter button via HTML `disabled`, since `ref` values don't affect React's declarative render.

Both are set to locked *before* the `await api.submitGuess(...)` call so the network round-trip is fully covered.

### O(1) word validation

On session start, `GET /api/words` is fetched once and stored in a `Set<string>` ref (`wordSetRef`). Invalid words are rejected immediately in the client before any animation or network call. This replaced a `Word.exists()` MongoDB query that ran on every guess submission.

### Tile flip animation

Classic Wordle scaleY flip: each tile in a submitted row flips from face-up → edge-on → face-up. The color swap happens at the midpoint (while the tile is edge-on and invisible), using an internal `revealed` state driven by a timeout at `position × 300ms + 300ms`. `will-change: transform` enables GPU compositing.

`REVEAL_TOTAL = 4 × 300 + 600 = 1800ms` — the point at which the last tile's animation completes. Input is unlocked and keyboard colors update only after this delay.

### Keyboard color timing

`Keyboard` filters the revealing row out of the letter-state calculation while animation is running. Colors on the keyboard keys update only after `REVEAL_TOTAL`, matching the tile reveal rather than appearing instantly when the guess is submitted.

### Cross-device sync (polling)

The game is polled every 4 seconds while `status === 'in_progress'`. The poll:
- Skips if `isRevealingRef.current` is true (local animation running).
- Bails with an early return if neither the guess count nor status changed — no state updates, no interference with mid-typing.
- Updates the board silently if another device submitted a guess.
- Shows the end-of-game modal if another device finished the game.
- Never clears `currentInput` — the modal covers the board if the game is over, and `initGame` clears it on Play Again.

A `guessesRef` (kept in sync via a `useEffect`) lets the interval callback compare counts without the effect re-running (and recreating the interval) on every guess.

### Optimistic Play Again

When Play Again is clicked, the board clears and the modal closes *synchronously* before any network request (`fresh = true` path in `initGame`). The input is locked (`inputLocked = true`) until the game ID arrives. `POST /api/games/new` now returns the full game state, so only one round trip is needed — down from two (new game ID + separate fetch for state).

Session refetches (e.g. returning to the tab triggers NextAuth's `refetchOnWindowFocus`) call `initGame()` without `fresh = true`, which skips the optimistic clear and restores quietly in the background without disrupting typing.

### Game ID persistence

The active game ID is stored in `localStorage` under `game_id`. On load, `initGame` checks for a stored ID, fetches its state, and restores if still in progress. This lets users resume mid-game after closing and reopening the tab. The stored ID is cleared when a game ends locally or when the poll detects the game ended on another device.

---

## Local setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment variables**

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|---|---|
| `NEXTAUTH_URL` | `http://localhost:3000` locally |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 credentials |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB` | Database name (e.g. `not-so-wordle`) |

**3. Google Cloud Console — authorized redirect URIs**

```
http://localhost:3000/api/auth/callback/google
https://your-domain.vercel.app/api/auth/callback/google
```

**4. Seed the word list**

Run once (or re-run safely at any time — skips duplicates):

```bash
MONGODB_URI=<your-uri> MONGODB_DB=<your-db> npx tsx scripts/seed.ts
```

If `.env.local` is already configured:

```bash
npx dotenv -e .env.local -- npx tsx scripts/seed.ts
```

**5. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Add all environment variables from `.env.local` to the Vercel project settings. Set `NEXTAUTH_URL` to your production domain.
3. Add the production callback URL to Google Cloud Console.
4. Run the seed script locally against Atlas — no build-time or deploy-time seeding needed.
