# Upload Puzzle to rebel-the-dog.com

Publishes a puzzle HTML file to the rebel-site GitHub repo and records its words, clues, and metadata in puzzle_clues.db.

## Site branding

**The site name is "Rebel's Blog"** — use this everywhere: nav logo, page title, footer copyright, share text. Never use "Rebel the Dog".

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
-- published_at: unix timestamp for 7 PM PDT on the Wednesday trivia night (02:00 UTC Thursday).
--   All puzzles in the same week share the same published_at value.
--   Example: Week played 4/1/2026 → new Date('2026-04-02T02:00:00Z').getTime()/1000
-- week: integer week number (1, 2, …); all three puzzles in a trio share the same week value.
-- url: full URL on rebel-the-dog.com. Format: https://rebel-the-dog.com/puzzles/<type>-MMDDYYYY.html
--   Crosswords and Find It have URLs. Printable puzzles (quote-contrary, connectagram) do NOT — leave null.
-- diversity_vetted_at: unix timestamp set after diversity analysis is complete.
--   NULL = not yet analyzed. Set even if no diversity entries were found (use to distinguish clean from unanalyzed).
puzzles (id, name TEXT UNIQUE, type TEXT, theme TEXT, published_at INTEGER nullable, created_at,
         week INTEGER nullable, url TEXT nullable, diversity_vetted_at INTEGER nullable)

-- Links a clue to a puzzle. is_theme=1 if the word/clue is part of the theme.
-- A word with multiple clues can have multiple puzzle_entries rows in the same puzzle.
-- is_theme conventions by type:
--   crossword: 1 for theme entries, 0 for fill
--   find-it: always 0 — the single entry is the theme by definition, no flag needed
--   connectagram: always 0 — entries are clues only; theme (connection) is in puzzles.theme
--   quote-contrary: 1 for contrary words (the ones that spell the hidden quote), 0 for filler words
puzzle_entries (id, puzzle_id → puzzles.id, clue_id → clues.id, is_theme INTEGER DEFAULT 0)
UNIQUE(puzzle_id, clue_id)
```

**Cross-reference with words.db:** join on `clues.word = words.word` (both plain TEXT).

## Clue + difficulty rules

- **Every clue with text MUST have a difficulty** (`easy`, `medium`, or `hard`).
- **For crossword clues**, use difficulty ratings already in puzzle_clues.db. If ratings are missing or incomplete for the puzzle being uploaded, prompt the user.
- **For other puzzle types**, use difficulty values already recorded (e.g. in the input JSON). If missing, ask the user.
- **No clue = no difficulty.** For puzzle types with no explicit clue (e.g. `find-it`), use `clue=''` and `difficulty=NULL`.
- **Same word, multiple clues = multiple rows.** DREAM can have an easy clue AND a hard clue — they are separate `clues` rows, each linked independently via `puzzle_entries`.
- **Same clue text, different word = separate rows** (UNIQUE is on `(word, clue)` together).

## Weekly puzzle structure

Each week consists of **exactly three puzzles** sharing a common theme:
- **Crossword** (`crossword` type) — grid puzzle (variable size)
- **Find It** (`find-it` type) — single-answer word puzzle
- **Exactly one printable puzzle** (type varies per week: `quote-contrary`, `connectagram`, etc.) — never more than one printable per week

**The weekly trio is formally named after the crossword title.** Example: the week containing "In the Beginning..." is called the "In the Beginning..." trio, not "Week 1."

Both the crossword's theme hint AND the Find It answer should each independently clue the printout puzzle's primary answer:
- Crossword hint → [implied concept] → printout answer
- Find It answer → [implied concept] → printout answer

Example (Week 1 / "In the Beginning..."): APRILFIRST → April 1st = April Fools' Day → hints the quote is about fools → "A Fool and His Money Are Soon Parted"; SCAMS → what fools fall for → same quote.

When recording metadata, note the week number and ensure all three puzzles share the same `week` value so they can be grouped in reporting.

**Calendar theming:** If the trio's theme aligns with the trivia night date, tag all three puzzles in `puzzle_tags`:
- `calendar:exact` — theme is specifically tied to the exact trivia night date (e.g. April Fools' Day puzzle played on April 1st)
- `calendar:approximate` — the themed date falls within 7 days of the trivia night (e.g. Halloween theme played within one week of Oct 31st)

```js
db.prepare('INSERT OR IGNORE INTO puzzle_tags (puzzle_id, tag) VALUES (?, ?)').run(puzzleId, 'calendar:exact');
```

## Puzzle naming convention (DB `name` field)

- **Crosswords:** use the internal puzzle title (e.g. `In the Beginning...`, `And the Winner Is...`)
- **All non-crossword puzzles:** use `<Type> MMDDYYYY` where the date is the trivia night date
  - `Find It! 4/1/2026` — note the slash-formatted date for Find It (matches existing entries)
  - `Quote Contrary 04012026` — zero-padded, no slashes
  - `Connectagram 04012026` — same format
  - Never use sequence numbers (#1, #2) — always use the date

## Puzzle types
- `find-it` — Wordle-style single-answer word puzzle (clue='', difficulty=NULL, theme=answer word)
  - **Page h1:** `Find It!` only — no puzzle number anywhere (not in h1, title tag, card, or share text)
  - **Filename convention:** `find-it-MMDDYYYY.html` using the trivia night date (e.g. `find-it-04082026.html`)
  - **Title tag:** `Find It! &bull; Rebel's Blog` — no number
  - **No Share Result button** — remove the `share-area` div, the `setTimeout` calls that reveal it, and the `share-btn` event listener. All existing Find It pages have already been cleaned; do not re-add this feature.
- `crossword` — Standard crossword (one or more clues per word, each with difficulty; theme words flagged with is_theme=1)
  - **Filename convention:** `crossword-MMDDYYYY.html` using the trivia night date (e.g. `crossword-04082026.html`)
  - **Difficulty:** Use ratings already recorded in puzzle_clues.db for this puzzle's clues. If any clues are missing difficulty ratings or the puzzle has no existing DB entries, prompt the user before proceeding.
  - **Theme for DB:** use the crossword's theme answer (the hidden answer revealed by the theme clue), e.g. "BEST IN SHOW" for "And the Winner Is..."
- `quote-contrary` — Printout trivia puzzle; one of several possible printout trivia types
- `connectagram` — Printout puzzle; fill-in answers where circled letters unscramble to reveal the connection. Generated by `generate-mc.js`. The answer key must match the puzzle page exactly: same entry order (shuffled), same visual layout with filled answer boxes. PDF is the deliverable; archive to OneDrive week folder. **No GitHub upload.**
  - **DB entries:** record each word with its clue and difficulty (map JSON difficulty 1→easy, 2→medium, 3→hard). The final answer word(s) are not separately recorded — the theme field on the puzzle row holds the connection phrase (e.g. "DOG SHOW GROUPS").
  - **Difficulty for DB:** use the `difficulty` values already set in the JSON by the user.
  - **Theme on puzzle page:** Do NOT show the theme on the puzzle page — the theme is a hint revealed by solving the crossword and Find It, and showing it on the printout gives it away. The theme MUST appear on the answer key page.
  - **Answer key hints:** The answer key must show the crossword theme hint and Find It answer that clue the connection. Add `crosswordHint` and `findItAnswer` fields to the input JSON; both are displayed in a "Hints from this week's puzzles" section on the answer key page.
  - **Entry ordering:** 2 easy clues first, then 2 medium, then 2 hard, then any remaining entries in random order. Difficulty is set via the `difficulty` field (1=easy, 2=medium, 3=hard) on each entry.
  - **Scoring:** 1 point per correct answer, 5 points for finding the connection. Show on puzzle page instructions, answer key, and cover page.
- Add new types as needed; no schema change required

## Steps to upload a puzzle

### 1. Gather metadata from the user
Always ask the user to supply — never invent:
- Puzzle name (e.g. "Find It! 4/1/2026" for a Find It, "In the Beginning..." for a crossword)
- Puzzle type
- Theme (what is the puzzle about?)
- For each word: ALL clue texts with their difficulty (easy/medium/hard), and whether the word is a theme word
- Whether to publish now or keep as draft

### 2. Inject feedback widget into the HTML

Before uploading, inject the feedback widget into the puzzle HTML (before the `<footer` tag). Use `add-feedback.js` as the reference implementation at `C:/users/tiwescot/PersonalAI/add-feedback.js`. The `feedbackBlock(puzzleName)` function generates the snippet — copy and call it with the puzzle's display name.

The widget:
- "Like this puzzle?" radio chips (👍 Yes / 🤷 Meh / 👎 No)
- "How was the difficulty?" radio chips (Too Easy / Just Right / Too Hard)
- On any click, slides open a textarea + Send button
- Submits via fetch to `https://formspree.io/f/__FORMSPREE_ID__` (placeholder until activated)
- Shows a "Thanks for the feedback! 🐾" confirmation on success

Skip this step only if the HTML already contains `id="fb-form"`.

### 3. Upload HTML to GitHub

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

const insClue   = db.prepare('INSERT OR IGNORE INTO clues (word, clue, difficulty, source) VALUES (?,?,?,\'growlerz\')');
const getClue   = db.prepare('SELECT id FROM clues WHERE word=? AND clue=?');
const insPuzzle = db.prepare('INSERT OR IGNORE INTO puzzles (name, type, theme, published_at, week, url) VALUES (?,?,?,?,?,?)');
const getPuzzle = db.prepare('SELECT id FROM puzzles WHERE name=?');
const insEntry  = db.prepare('INSERT OR IGNORE INTO puzzle_entries (puzzle_id, clue_id, is_theme) VALUES (?,?,?)');
const insTag    = db.prepare('INSERT OR IGNORE INTO puzzle_tags (puzzle_id, tag) VALUES (?,?)');

db.transaction(() => {
  // Insert puzzle record
  // url: set for crossword/find-it (https://rebel-the-dog.com/puzzles/<type>-MMDDYYYY.html); null for printables
  insPuzzle.run(puzzleName, puzzleType, theme, publishedAt ?? null, week, url ?? null);
  const puzzleId = getPuzzle.get(puzzleName).id;

  for (const { word, clue, difficulty, isTheme } of entries) {
    insClue.run(word.toUpperCase(), clue ?? '', difficulty ?? null);
    const clueId = getClue.get(word.toUpperCase(), clue ?? '').id;
    insEntry.run(puzzleId, clueId, isTheme ? 1 : 0);
  }

  // Tags: always add date tag; add calendar tags if applicable; add difficulty tag for crosswords and printables
  insTag.run(puzzleId, triviaNightDate);          // e.g. '4/8/2026'
  // insTag.run(puzzleId, 'calendar:exact');       // if theme is tied to the exact trivia night date
  // insTag.run(puzzleId, 'calendar:approximate'); // if theme is within 7 days of the trivia night date
  // insTag.run(puzzleId, 'easy');                 // overall puzzle difficulty (crossword + printables; skip find-it)
})();

db.close();
```

### 4. Run diversity analysis

After recording the puzzle in the DB, run a diversity analysis on it and insert any touchpoints found into `diversity_entries`. Then set `diversity_vetted_at` regardless of whether any touchpoints were found:

```js
db.prepare('UPDATE puzzles SET diversity_vetted_at = ? WHERE name = ?').run(Math.floor(Date.now()/1000), puzzleName);
```

A puzzle with `diversity_vetted_at` set and zero `diversity_entries` rows is intentionally sparse — not unanalyzed. See the `/diversity-tracker` skill for analysis guidance.

### 6. Archive to OneDrive

Copy the puzzle's deliverable file(s) to the OneDrive archive at:
```
C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/<YYYY-MM-DD>/
```
where `<YYYY-MM-DD>` is the **Wednesday of the trivia night** the puzzle set is for (create the folder if it doesn't exist). All three puzzles in a week (crossword, Find It, printout) use this same folder regardless of when they were individually published.

**What to archive by puzzle type:**
- `crossword` — the `.ipuz` source file (already in OneDrive from Crossword Compiler; confirm it's there, don't duplicate)
- `find-it` — no separate file; the HTML is on GitHub
- `quote-contrary` (and other printout types) — copy the **PDF** from `rebel-puzzles/<YYYY-MM-DD>/` to the OneDrive week folder

```js
const fs = require('fs');
const src  = 'C:/users/tiwescot/personalai/rebel-puzzles/<YYYY-MM-DD>/<filename>.pdf';
const dest = 'C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/<YYYY-MM-DD>/';
if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(src, dest + '<filename>.pdf');
```

### 7. (Optional) Publish — add puzzle card to puzzles.html and index.html

Fetch current `puzzles.html` from GitHub, insert a card into the puzzle grid, and PUT it back.
Only do this when the user explicitly asks to publish (move out of draft).

**Always publish a single week card — never individual puzzle cards.** Each week is represented by one card on puzzles.html and index.html, linking to `puzzles/week-MMDDYYYY.html`. Use the multi-puzzle SVG icon (the 4-quadrant grid). Label: `Puzzles for M/D/YYYY`. Title: the crossword name. Date: the trivia night date. Never add separate cards for the crossword, Find It, or printable.
Also set `published_at` in the puzzles table at this time:
```js
db.prepare('UPDATE puzzles SET published_at=? WHERE name=?').run(Math.floor(Date.now()/1000), puzzleName);
```

**After updating puzzles.html, also update index.html:**

The index.html "Latest Puzzles" section uses the same `<!-- PUZZLE_CARDS_START -->` / `<!-- PUZZLE_CARDS_END -->` markers. After inserting the new card into puzzles.html, extract **all cards** from between puzzles.html's markers, take the **first 3** (most recently added = closest to the START marker), and replace the content between index.html's markers with those 3 cards.

```js
// Extract cards from puzzles.html
const startMarker = '<!-- PUZZLE_CARDS_START -->';
const endMarker   = '<!-- PUZZLE_CARDS_END -->';

function extractCards(html) {
  const start = html.indexOf(startMarker) + startMarker.length;
  const end   = html.indexOf(endMarker);
  return html.slice(start, end).trim();
}

function replaceCards(html, newCards) {
  const start = html.indexOf(startMarker) + startMarker.length;
  const end   = html.indexOf(endMarker);
  return html.slice(0, start) + '\n' + newCards + '\n' + html.slice(end);
}

// Split cards in puzzles.html by </a> boundaries, take first 3
function topThreeCards(cardsBlock) {
  const cards = cardsBlock.split(/(?<=<\/a>)/).map(s => s.trim()).filter(Boolean);
  return cards.slice(0, 3).join('\n');
}

const puzzlesCards = extractCards(puzzlesHtml);
const top3 = topThreeCards(puzzlesCards);

// Fetch index.html, replace its marker content, PUT it back
// GET https://api.github.com/repos/twescott/rebel-site/contents/index.html
// PUT with updated content
const updatedIndex = replaceCards(indexHtml, top3);
```

## License
All puzzles published on rebel-the-dog.com are licensed under **CC BY-SA 4.0**.
Include this in every puzzle page footer:
```html
<p>This puzzle is licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank">CC BY-SA 4.0</a>.</p>
```

## Crossword source files
Puzzles are authored in CrosswordCompiler (.ccw files on OneDrive).
- The internal puzzle title (inside the .ccw) is the canonical title — never assume the filename matches.
- **Export as `.ipuz`** (not .puz). iPuz preserves cell shading; .puz does not. Remind the user if they offer a .puz or other format.
- Use the existing `parse-ipuz.js` parser at `C:/Users/tiwescot/PersonalAI/parse-ipuz.js`.
- Generate the HTML with `generate-crossword.js` at `C:/Users/tiwescot/PersonalAI/generate-crossword.js`.
  - **ALWAYS run parse-ipuz.js → puz-output.json immediately before generate-crossword.js in a single chained command.** Never run generate-crossword.js against a stale puz-output.json.
  - Correct pipe: `node parse-ipuz.js <path>.ipuz > puz-output.json && node generate-crossword.js`
  - generate-crossword.js writes to a hardcoded path (`C:/users/tiwescot/rebel-site/puzzles/crossword-001.html`). Copy that file to the correct destination — do NOT redirect its stdout.

## Crossword upload verification

After uploading a crossword HTML to GitHub, **always verify the live content** by fetching a sample of clues directly from the published URL before telling the user the update is complete. If the user reports clues are wrong, **believe them immediately** — do not suggest CDN cache as an explanation until after verifying the live content yourself with curl.

## Crossword page design

All design decisions below are locked in — do not deviate without explicit instruction.

- **Header:** puzzle title + "By [author]" only — no puzzle number, no theme
- **Page title tag:** `<title>[Puzzle Title] — Rebel the Dog</title>`
- **Footer:** No blog title or tagline. Contains only: intro line (if present), CC BY-SA 4.0 license. Blog title is "Rebel's Blog" (NOT "Rebel the Dog").
- **Black cells:** `#000000` (pure black, not navy)
- **Shaded cells:** `#d4d4d4` (gray, for theme highlights from iPuz `color:C0C0C0` cells)
- **Clues:** no word-length suffixes (strip trailing `(N)` from clue text)
- **Cell size:** `clamp(20px, 5.5vw, 40px)` on all screens
- **Layout:** grid left (~60%) + scrollable clue panels right (~40%) on desktop; stacked on mobile
- **Nav:** same as all site pages — "About" hidden on mobile (it's in the footer)

### Toolbar buttons
- Check / Reveal / Clear dropdowns (Letter / Word / Puzzle each)
- Rebus toggle
- Autocheck toggle
- Active buttons use navy fill + white text; hover darkens (`#162d4a`) via `data-on` CSS selector

### HTML entities in clues
iPuz stores quotes as `&quot;` etc. — `parse-ipuz.js` decodes them via `decodeHtml()` so they render correctly. Always verify this is in place when touching the parser.

## Notes
- NEVER invent puzzle names, clue text, themes, or difficulty ratings — always ask the user.
- `puzzle_clues.db` is tracked in the `xword-db` GitHub repo. Commit and push it after updates.
