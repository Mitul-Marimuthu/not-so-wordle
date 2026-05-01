// Pure game logic — no imports, no side effects, easy to test.

/**
 * Compare a 5-letter guess against the target word.
 * Returns a 5-element array: "+" correct position, "x" wrong position, "-" absent.
 *
 * Two-pass algorithm handles duplicates correctly.
 * e.g. guessing "SPEED" vs target "SPELL" → only one E lights up yellow.
 */
export function evaluateGuess(guess: string, target: string): string[] {
  const result: string[] = Array(5).fill('');
  const remaining: Record<string, number> = {};

  // Pass 1: mark greens, count leftover target letters.
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      result[i] = '+';
    } else {
      remaining[target[i]] = (remaining[target[i]] ?? 0) + 1;
    }
  }

  // Pass 2: yellows and grays — consume one occurrence per yellow match.
  for (let i = 0; i < 5; i++) {
    if (result[i] === '+') continue;
    if (remaining[guess[i]] > 0) {
      result[i] = 'x';
      remaining[guess[i]]--;
    } else {
      result[i] = '-';
    }
  }

  return result;
}

/**
 * Weighted random word selection.
 * Words the player hasn't solved yet → weight 1.0 (preferred).
 * Words already solved → weight 0.1 (can still appear, but rarely).
 */
export function selectWord(allWords: string[], solvedWords: string[]): string {
  const solvedSet = new Set(solvedWords);

  const pool = allWords.map(w => ({
    word: w,
    weight: solvedSet.has(w) ? 0.1 : 1.0,
  }));

  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;

  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e.word;
  }

  // Floating-point rounding fallback.
  return pool[pool.length - 1].word;
}
