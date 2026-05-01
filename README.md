# Definitely Not Wordle

A fullstack Wordle clone with unlimited play, user profiles, streaks, and a global leaderboard.

---

## Tech Stack

### Frontend — Next.js (TypeScript) on Vercel
React-based with the App Router, deployed to Vercel with zero configuration. Tailwind CSS handles the grid/tile UI. The frontend never sees the target word — it only receives tile color results from the backend.

### Backend — Go REST API on Railway
A standalone Go service (using the `chi` router) hosted on Railway. All game logic lives here: word selection, guess validation, streak calculation, and OAuth handling. Keeping the backend as a separate process (rather than Next.js API routes) allows us to write it in Go and keeps concerns cleanly separated.

### Database — MongoDB Atlas
Two main concerns:
- **Word storage**: all valid 5-letter words seeded once from the [rypmaloney/wordle-api](https://github.com/rypmaloney/wordle-api) word list (see Design Decisions below)
- **Player records**: profiles, game history, streaks

### Auth — Google OAuth 2.0
Handled entirely in Go using `golang.org/x/oauth2`. On successful login the backend issues a signed JWT that the frontend stores and sends with every API request. The Google OAuth flow never touches the Next.js layer.

---

## MongoDB Collections

### `words`
Seeded once from the `goodWords.json` file in the rypmaloney/wordle-api repository. Each document represents a valid 5-letter word.

```json
{
  "word": "crane",
  "definition": "a large, tall machine used for moving heavy objects",
  "partOfSpeech": "noun"
}
```

### `users`
One document per authenticated player. `solvedWords` is the key field that drives weighted word selection.

```json
{
  "googleId": "...",
  "email": "user@example.com",
  "name": "Jane Doe",
  "avatar": "https://...",
  "totalSolved": 42,
  "currentStreak": 5,
  "longestStreak": 12,
  "solvedWords": ["crane", "stove", "plumb"]
}
```

### `games`
One document per game session. The `word` field is never sent to the frontend — only `guesses` results (tile colors) are returned.

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

### Auth

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/auth/google` | Redirects the user to Google's OAuth consent screen |
| `GET` | `/auth/google/callback` | Handles the OAuth callback from Google, creates or retrieves the user record, and returns a signed JWT |

### Games

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/games/new` | Starts a new game session. The backend runs weighted word selection (see Design Decisions) and returns a `gameId`. The target word is **never** included in the response. |
| `POST` | `/api/games/:id/guess` | Submits a 5-letter guess for an active game. The backend validates that the guess is a real word, computes the green/yellow/gray result, updates the game record, and — if the game is now complete — updates the user's streak and `solvedWords`. |
| `GET` | `/api/games/:id` | Returns the current state of a game (guesses made so far, status). Used to restore an in-progress game on page refresh. |

### Profile

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/profile` | Returns the authenticated user's stats: `totalSolved`, `currentStreak`, `longestStreak`, and full game history (words found with dates). |

### Leaderboard

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/leaderboard/streak` | Returns the top players ranked by `longestStreak`. |
| `GET` | `/api/leaderboard/total` | Returns the top players ranked by `totalSolved`. |

---

## Design Decisions

### Unlimited Play (not daily)
The original Wordle gives one word per day. For this project, unlimited play was chosen deliberately — it better demonstrates fullstack depth (session management, per-user state, weighted selection logic) and makes the leaderboard more dynamic and meaningful over time.

### Word List: Self-Hosted in MongoDB
Rather than depending on a third-party API (like the RapidAPI Wordle API) for word selection and validation, the word list from [rypmaloney/wordle-api](https://github.com/rypmaloney/wordle-api) is seeded into MongoDB once via a Go migration script. This means:
- Zero external dependencies at runtime for word logic
- Full control over the word set
- No API keys, rate limits, or outage risk from a third party

The `goodWords.json` file from that repo contains 5-letter words with definitions and parts of speech, which also allows the UI to optionally show a word's definition after a game ends.

### Weighted Word Selection
When a player starts a new game, the backend selects a word using weighted random sampling:
- Words the player has **not yet solved** → weight `1.0`
- Words the player **has already solved** → weight `0.1`

This ensures players encounter new words first, while previously solved words can still reappear occasionally. Once a player has solved every word in the database, weights reset and the cycle begins again. This logic runs entirely in Go and requires no additional infrastructure.

### Guess Validation in Go (not via API)
The green/yellow/gray computation is implemented directly in Go rather than proxied through the RapidAPI. This is deliberate — the duplicate-letter edge case (e.g. guessing `SPEED` when the answer is `SPELL`) is subtle and easy to get wrong. Owning the implementation means we can test it thoroughly and not trust a third party to handle it correctly.

### Streak = Consecutive Wins
Since play is unlimited and not tied to a calendar day, streak is defined as **consecutive games won without a loss**. A streak resets the moment a player fails to guess the word within 6 tries. This is more skill-reflective than a daily streak and works naturally with unlimited play.

### Backend as a Separate Go Service
The Go backend is deployed independently (Railway) rather than as Next.js API routes. This keeps the frontend and backend fully decoupled, allows the backend to be written in Go (the preferred language), and follows standard industry practice for fullstack applications. The Next.js frontend communicates with the Go API over HTTPS with JWT auth.

---

## Project Structure

```
wordle/
├── frontend/          # Next.js (TypeScript) — deployed to Vercel
│   ├── app/
│   ├── components/
│   └── ...
├── backend/           # Go REST API — deployed to Railway
│   ├── main.go
│   ├── handlers/
│   ├── models/
│   ├── middleware/
│   └── seed/          # One-time word import script
└── README.md
```

---

## Word List Source

Words sourced from [rypmaloney/wordle-api](https://github.com/rypmaloney/wordle-api) — an Express/Postgres Wordle API whose `goodWords.json` word list is used here as a one-time seed for the MongoDB `words` collection.
