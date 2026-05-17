# Word Building Puzzle

Generates and records a Word Building puzzle for Growlerz Trivia Night.

**What it is:** A printable puzzle where players arrange letter "rooms" (2–3 letter chunks) into horizontal words. The first letter of each word is highlighted in a center column — reading top to bottom, those letters spell the hidden theme word.

## Paths
- **Growlerz spreadsheet:** `C:/Users/tiwescot/OneDrive/Growlerz Puzzles.xlsm` (WB Generator sheet)
- **puzzle_clues.db:** `C:/users/tiwescot/PersonalAI/puzzle_clues.db`
- **Input JSON folder:** `C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/`
- **Archive:** `C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/<YYYY-MM-DD>/`

## Puzzle mechanics

- **Vertical theme word** (e.g. MARINERS) — one letter per row
- **One answer word per theme letter** — each answer contains exactly one occurrence of its assigned theme letter
- **Rooms** — the non-theme portions of each answer word are split into 2–3 character chunks called "rooms"
- **Room Bank** — all rooms from all words **plus the individual theme letters** are sorted (shortest first, then alpha) and displayed in a scrambled grid
- **Solver task** — arrange rooms from the Room Bank to reconstruct the horizontal words; the shaded center column shows *where* the theme letters go, but the solver must determine *which* letter belongs in each row

### Constraints
- Number of answer words **must equal** the length of the theme word (e.g. 7 words for SEATTLE, 8 for MARINERS)
- Maximum 12 answer words (spreadsheet limit)
- Each answer word must contain at least one occurrence of its assigned theme letter

### SplitIntoRooms algorithm

The non-theme portion of each word is split into rooms according to this table:

| Length | 2-char rooms | 3-char rooms |
|--------|-------------|-------------|
| 1–3    | —           | — (one room = whole text) |
| 4      | 2           | 0 |
| 5      | 1           | 1 |
| 6      | 0           | 2 |
| 7      | 2           | 1 |
| 8      | 1           | 2 |
| 9      | 0           | 3 |
| 10     | 2           | 2 |
| 11+    | use `n mod 3`: if 0 → all 3s; if 1 → two 2s + rest 3s; if 2 → one 2 + rest 3s |

Room sizes are **shuffled** (Fisher-Yates) before the text is cut, so the split point order is randomized — the same word may produce different room arrangements each time.

After splitting, rooms for each word are sorted by length (2s before 3s), then alphabetically within each length group.

If a theme letter appears multiple times in an answer word, the VBA picks one position at random.

## Input JSON format

Save as `C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/wb-<slug>.json`:

```json
{
  "theme": "MARINERS",
  "title": "BASEBALL",
  "crosswordHint": "BASEBALL TEAMS",
  "findItAnswer": "INNINGS",
  "entries": [
    { "word": "BRYCEMARPER" },
    { "word": "GEORGEKIRBY" },
    ...
  ]
}
```

- `theme` — the vertical word (all caps); must equal the number of entries
- `title` — the puzzle category label shown on the page (what the words have in common)
- `entries` — one object per theme letter, in order; only `word` is needed (no clues for WB)

## Generating the puzzle (Excel VBA)

1. Open `C:/Users/tiwescot/OneDrive/Growlerz Puzzles.xlsm`
2. Go to the **WB Generator** sheet
3. Enter the vertical theme word in **cell C9**
4. Enter the puzzle title in **cell C10**
5. Enter answer words in **column B, rows 14–25** (one per row, in theme-letter order)
6. Click **GENERATE** — the macro fills in positions, rooms, and the answer key preview
7. Verify the answer key preview (rows 33–44) looks correct
8. Go to the **WB Print Ready** sheet — the print layout was auto-generated
9. Export as PDF: File → Export → Create PDF/XPS (or Print → Save as PDF)
10. Name the PDF: `Word Building <TITLE>.pdf` (e.g. `Word Building BASEBALL.pdf`)

## DB recording

DB type: `word-building`  
DB name: `Word Building MMDDYYYY` (zero-padded, e.g. `Word Building 04222026`)  
No URL (printable only — no GitHub upload)

```js
const Database = require('better-sqlite3');
const db = new Database('C:/users/tiwescot/PersonalAI/puzzle_clues.db');
db.pragma('foreign_keys = ON');

const insClue   = db.prepare('INSERT OR IGNORE INTO clues (word, clue, difficulty) VALUES (?,?,?)');
const getClue   = db.prepare('SELECT id FROM clues WHERE word=? AND clue=?');
const insPuzzle = db.prepare('INSERT OR IGNORE INTO puzzles (name, type, theme, published_at, week, url) VALUES (?,?,?,?,?,?)');
const getPuzzle = db.prepare('SELECT id FROM puzzles WHERE name=?');
const insEntry  = db.prepare('INSERT OR IGNORE INTO puzzle_entries (puzzle_id, clue_id, is_theme) VALUES (?,?,?)');
const insTag    = db.prepare('INSERT OR IGNORE INTO puzzle_tags (puzzle_id, tag) VALUES (?,?)');

db.transaction(() => {
  insPuzzle.run('Word Building 04222026', 'word-building', 'MARINERS', publishedAt, week, null);
  const puzzleId = getPuzzle.get('Word Building 04222026').id;

  for (const { word } of entries) {
    insClue.run(word.toUpperCase(), '', null);   // WB: no clue text, no difficulty
    const clueId = getClue.get(word.toUpperCase(), '').id;
    insEntry.run(puzzleId, clueId, 0);           // is_theme=0 (no theme flagging for WB)
  }

  insTag.run(puzzleId, '4/22/2026');             // trivia night date tag
})();

db.close();
```

### Clue/difficulty rules for WB
Word Building has no clues — every entry is `clue=''`, `difficulty=NULL`. This is consistent with Find It behavior: the word is the puzzle.

## Archive to OneDrive

Copy the PDF to the week's OneDrive archive folder:

```
C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/<YYYY-MM-DD>/Word Building <TITLE>.pdf
```

```js
const fs = require('fs');
const src  = 'C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/Word Building <TITLE>.pdf';
const dest = 'C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/<YYYY-MM-DD>/';
if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(src, dest + 'Word Building <TITLE>.pdf');
```

## Week page card visibility

**Do NOT add the Word Building card to `week-MMDDYYYY.html` until after trivia night.**

Word Building is a printable distributed at the event — it is never published online. Its card should only appear on the week page after the trivia night has occurred (i.e., after the puzzle has been given out).

The same rule applies to all puzzle cards on week pages: **a puzzle card should not appear until the underlying puzzle is published/available.** For online puzzles (crossword, Find It), add the card when the HTML goes live. For printables (WB, Connectagram, Quote Contrary), add the card after trivia night.

When creating the week page initially, leave a placeholder comment where the WB card will go:
```html
<!-- Word Building card added after trivia night (YYYY-MM-DD) -->
```

After trivia night, replace the comment with the actual card HTML.

## Weekly trio role

Word Building is the **printable puzzle** in the weekly trio (same role as Quote Contrary or Connectagram). All three puzzles in the week share the same `week` and `published_at` values.

The answer words in the Room Bank should thematically connect to the same concept as the crossword theme hint and Find It answer.

## Examples

| Theme | Title | Source |
|-------|-------|--------|
| SEATTLE | NEIGHBORHOODS | WB NEIGHBORHOODS sheet |
| MARINERS | BASEBALL | WB BASEBALL sheet |
| REVENUE | REVENUE | WB REVENUE sheet |

## Diversity analysis

Run diversity analysis after recording in DB and set `diversity_vetted_at`:

```js
db.prepare('UPDATE puzzles SET diversity_vetted_at = ? WHERE name = ?')
  .run(Math.floor(Date.now()/1000), 'Word Building 04222026');
```

WB puzzles are typically sparse for diversity — the answer words are usually concrete nouns (neighborhood names, player names, etc.) with no associated clue text. Note any people referenced in the answer words.
