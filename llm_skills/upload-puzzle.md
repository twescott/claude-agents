# Upload Puzzle to rebel-the-dog.com

Publishes a puzzle HTML file to the rebel-site GitHub repo and records its words, clues, and metadata in puzzle_clues.db.

## Paths
- **puzzle_clues.db:** `C:/users/tiwescot/PersonalAI/puzzle_clues.db`
- **GitHub repo:** `twescott/rebel-site` (private)
- **GitHub token:** in `C:/users/tiwescot/PersonalAI/config.local.json` (key: `github.token`)
- **Puzzles directory in repo:** `puzzles/`

## Schema reference

```sql
-- One row per (word, clue) pair.
-- A word can have MULTIPLE rows — one per distinct clue, each with its own difficulty.
-- difficulty is REQUIRED whenever clue is non-empty. NULL only when clue=''.
-- Examples for the word DREAM:
--   ('DREAM', 'What you do at night',             'easy')
--   ('DREAM', 'Martin Luther King speech subject', 'hard')
--   ('DREAM', '',                                  NULL )  ← find-it: no clue, no difficulty
clues (id, word TEXT, clue TEXT DEFAULT '', difficulty TEXT nullable CHECK('easy'|'medium'|'hard'), notes, created_at)
UNIQUE(word, clue)

-- One row per puzzle.
-- published_at=NULL means draft. Set to unix timestamp when publishing.
puzzles (id, name TEXT UNIQUE, type TEXT, theme TEXT, published_at INTEGER nullable, created_at)

-- Links a clue to a puzzle. is_theme=1 if the word/clue is part of the theme.
-- A word with multiple clues can have multiple puzzle_entries rows in the same puzzle.
puzzle_entries (id, puzzle_id → puzzles.id, clue_id → clues.id, is_theme INTEGER DEFAULT 0)
UNIQUE(puzzle_id, clue_id)
```

**Cross-reference with words.db:** join on `clues.word = words.word` (both plain TEXT).

## Clue + difficulty rules

- **Every clue with text MUST have a difficulty** (`easy`, `medium`, or `hard`). Always ask the user.
- **No clue = no difficulty.** For puzzle types with no explicit clue (e.g. `find-it`), use `clue=''` and `difficulty=NULL`.
- **Same word, multiple clues = multiple rows.** DREAM can have an easy clue AND a hard clue — they are separate `clues` rows, each linked independently via `puzzle_entries`.
- **Same clue text, different word = separate rows** (UNIQUE is on `(word, clue)` together).

## Puzzle types
- `find-it` — Wordle-style single-answer word puzzle (clue='', difficulty=NULL, theme=answer word)
- `crossword` — Standard crossword (one or more clues per word, each with difficulty; theme words flagged with is_theme=1)
- Add new types as needed; no schema change required

## Steps to upload a puzzle

### 1. Gather metadata from the user
Always ask the user to supply — never invent:
- Puzzle name (e.g. "Find It! #1")
- Puzzle type
- Theme (what is the puzzle about?)
- For each word: ALL clue texts with their difficulty (easy/medium/hard), and whether the word is a theme word
- Whether to publish now or keep as draft

### 2. Upload HTML to GitHub

```js
const fs    = require('fs');
const token = require('C:/users/tiwescot/PersonalAI/config.local.json').github.token;
const content = fs.readFileSync('<path-to-html-file>').toString('base64');

// Check if file already exists (need its SHA to update):
// GET https://api.github.com/repos/twescott/rebel-site/contents/puzzles/<filename>
// If 200: include "sha" field in body. If 404: omit sha.

const body = JSON.stringify({
  message: 'Add <puzzle name>',
  content,
  // sha: '<existing-sha>'  // only when updating an existing file
});
// PUT https://api.github.com/repos/twescott/rebel-site/contents/puzzles/<filename>
// Header: Authorization: token <token>
```

### 3. Record in puzzle_clues.db

```js
const Database = require('better-sqlite3');
const db = new Database('C:/users/tiwescot/PersonalAI/puzzle_clues.db');
db.pragma('foreign_keys = ON');

const insClue   = db.prepare('INSERT OR IGNORE INTO clues (word, clue, difficulty) VALUES (?,?,?)');
const getClue   = db.prepare('SELECT id FROM clues WHERE word=? AND clue=?');
const insPuzzle = db.prepare('INSERT OR IGNORE INTO puzzles (name, type, theme, published_at) VALUES (?,?,?,?)');
const getPuzzle = db.prepare('SELECT id FROM puzzles WHERE name=?');
const insEntry  = db.prepare('INSERT OR IGNORE INTO puzzle_entries (puzzle_id, clue_id, is_theme) VALUES (?,?,?)');

db.transaction(() => {
  // Insert puzzle record
  insPuzzle.run(puzzleName, puzzleType, theme, publishedAt ?? null);
  const puzzleId = getPuzzle.get(puzzleName).id;

  for (const { word, clue, difficulty, isTheme } of entries) {
    insClue.run(word.toUpperCase(), clue ?? '', difficulty ?? null);
    const clueId = getClue.get(word.toUpperCase(), clue ?? '').id;
    insEntry.run(puzzleId, clueId, isTheme ? 1 : 0);
  }
})();

db.close();
```

### 4. (Optional) Publish — add puzzle card to puzzles.html

Fetch current `puzzles.html` from GitHub, insert a card into the puzzle grid, and PUT it back.
Only do this when the user explicitly asks to publish (move out of draft).
Also set `published_at` in the puzzles table at this time:
```js
db.prepare('UPDATE puzzles SET published_at=? WHERE name=?').run(Math.floor(Date.now()/1000), puzzleName);
```

## Notes
- NEVER invent puzzle names, clue text, themes, or difficulty ratings — always ask the user.
- `puzzle_clues.db` is tracked in the `xword-db` GitHub repo. Commit and push it after updates.
