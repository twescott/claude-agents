# Connectagram Puzzle Generator

Generates and records a Connectagram puzzle for Growlerz Trivia Night.

**What it is:** A printable fill-in puzzle where players answer clues to fill in answer boxes. Certain boxes are circled — the circled letters, when unscrambled, reveal a hidden connection (the final answer). The crossword theme hint and Find It answer each independently clue the connection.

## Paths
- **Generator script:** `C:/Users/tiwescot/PersonalAI/generate-mc.js`
- **Auto-circle script:** `C:/Users/tiwescot/PersonalAI/auto-circle.js`
- **Input JSON folder:** `C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/`
- **puzzle_clues.db:** `C:/users/tiwescot/PersonalAI/puzzle_clues.db`
- **Archive:** `C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/<YYYY-MM-DD>/`

## Puzzle mechanics

- Each entry is a word with a clue and a difficulty rating
- Each word has **circled positions** (1-indexed); the circled letters across all entries unscramble to the **final answer** (the hidden connection)
- Hyphens in words count as positions
- The puzzle page does NOT show the theme — the theme is a hint revealed by solving the crossword and Find It
- The answer key shows the theme, filled-in answers, and the crossword hint + Find It answer that clue the connection

### Circle position design

**Always use `auto-circle.js`** to generate circle positions:

```bash
node auto-circle.js <input.json>          # compute and write positions
node auto-circle.js <input.json> --dry-run  # preview without writing
```

The script (ported from the VBA `AutoCirclePositions()` macro in `Growlerz Puzzles.xlsm`):
1. Processes most-constrained words first (fewest matching letters)
2. Guarantees every word gets at least 1 circle
3. Distributes remaining letters evenly (words with fewest circles get priority)
4. Prefers non-adjacent, center-biased positions
5. Validates that circled letters match the final answer
6. Writes updated `circlePositions` back to the JSON

**Do not manually assign circle positions.** Run the script, review the output, and re-run if the random distribution isn't satisfactory.

### Entry ordering

Order entries: **2 easy, 2 medium, 2 hard, then cycle E-M-H (1 each) until all entries placed.** If a difficulty tier runs out during cycling, skip it and continue.

Within each tier, select entries **randomly** (Fisher-Yates or equivalent).

The generator script (`generate-mc.js`) has its own `orderedEntries()` function that handles: 2 of each tier first, then shuffles the rest. If you set the entry order in the JSON via `displayOrder`, it overrides the script's ordering.

## Input JSON format

Save as `C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/mc-<slug>.json`:

```json
{
  "theme":         "HIDDEN CONNECTION",
  "crosswordHint": "MIDDLE AMERICA",
  "findItAnswer":  "METROS",
  "crosswordUrl":  "https://rebel-the-dog.com/puzzles/crossword-MMDDYYYY.html",
  "findItUrl":     "https://rebel-the-dog.com/puzzles/find-it-MMDDYYYY.html",
  "finalAnswer":   "MIDWESTERN CITIES",
  "entries": [
    {
      "word": "CHICAGO",
      "circlePositions": [4],
      "difficulty": 1,
      "clue": "Musical starring Gwen Verdon"
    }
  ]
}
```

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `theme` | Yes | Label shown on answer key (the hidden connection phrase) |
| `crosswordHint` | Yes | Shown on answer key — the crossword's theme hint |
| `findItAnswer` | Yes | Shown on answer key — the Find It answer |
| `crosswordUrl` | No | Adds QR code to cover page |
| `findItUrl` | No | Adds QR code to cover page |
| `finalAnswer` | Yes | The anagram answer — circled letters must unscramble to this |
| `displayOrder` | No | Explicit word order array (overrides auto-ordering) |
| `entries[].word` | Yes | Answer word (uppercase; hyphens allowed) |
| `entries[].circlePositions` | Yes | 1-indexed positions of circled letters |
| `entries[].clue` | Yes | Clue text |
| `entries[].difficulty` | Yes | 1=easy, 2=medium, 3=hard |

## Generating the puzzle

```bash
node C:/Users/tiwescot/PersonalAI/generate-mc.js \
  "C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/mc-<slug>.json" \
  "C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/mc-<slug>"
```

Outputs:
- `mc-<slug>.html` — source HTML (browser preview)
- `mc-<slug>.pdf` — print-ready PDF (cover + puzzle + answer key)

The PDF is the deliverable for printing.

### Validation

`auto-circle.js` validates automatically. If you need a standalone check:

```js
const data = require('./<input>.json');
const letters = data.entries.flatMap(e => e.circlePositions.map(p => e.word[p - 1]));
const sorted = letters.sort().join('');
const target = data.finalAnswer.replace(/ /g, '').split('').sort().join('');
console.log('Match:', sorted === target);
```

## DB recording

DB type: `connectagram`
DB name: `Connectagram MMDDYYYY` (zero-padded trivia night date, e.g. `Connectagram 04292026`)
No URL (printable only — no GitHub upload)

```js
const Database = require('better-sqlite3');
const db = new Database('C:/users/tiwescot/PersonalAI/puzzle_clues.db');
db.pragma('foreign_keys = ON');

const insClue   = db.prepare("INSERT OR IGNORE INTO clues (word, clue, source) VALUES (?,?,'growlerz')");
const getClue   = db.prepare('SELECT id FROM clues WHERE word=? AND clue=?');
const insPuzzle = db.prepare('INSERT OR IGNORE INTO puzzles (name, type, theme, published_at, week, url) VALUES (?,?,?,?,?,?)');
const getPuzzle = db.prepare('SELECT id FROM puzzles WHERE name=?');
const insEntry  = db.prepare('INSERT OR IGNORE INTO puzzle_entries (puzzle_id, clue_id, is_theme) VALUES (?,?,?)');
const insTag    = db.prepare('INSERT OR IGNORE INTO puzzle_tags (puzzle_id, tag) VALUES (?,?)');

db.transaction(() => {
  insPuzzle.run('Connectagram 04292026', 'connectagram', 'MIDWESTERN CITIES', publishedAt, week, null);
  const puzzleId = getPuzzle.get('Connectagram 04292026').id;

  // Record each entry word with its clue; map difficulty: 1→easy, 2→medium, 3→hard
  const diffMap = { 1: 'easy', 2: 'medium', 3: 'hard' };
  for (const e of entries) {
    insClue.run(e.word.toUpperCase(), e.clue);
    const clueId = getClue.get(e.word.toUpperCase(), e.clue).id;
    insEntry.run(puzzleId, clueId, 0);  // is_theme=0 always for connectagram
  }

  insTag.run(puzzleId, '4/29/2026');  // trivia night date tag
})();

db.close();
```

### DB rules for Connectagram
- Each word is recorded with its clue text and difficulty
- The final answer word(s) are NOT separately recorded — the `theme` field on the puzzle row holds the connection phrase
- `is_theme` = 0 for all entries (entries are clues only; theme is the hidden connection)
- **Do NOT show the theme on the puzzle page** — the theme is a hint revealed by solving the crossword and Find It

## Scoring

- 1 point per correct answer
- 5 points for finding the connection (unscrambling the circled letters)
- Show scoring on puzzle page instructions, answer key, and cover page

## Archive to OneDrive

Copy the PDF to the week's OneDrive archive folder:

```
C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/<YYYY-MM-DD>/Connectagram MMDDYYYY.pdf
```

```js
const fs = require('fs');
const src  = 'C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/mc-<slug>.pdf';
const dest = 'C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/<YYYY-MM-DD>/';
if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(src, dest + 'Connectagram MMDDYYYY.pdf');
```

## Week page card visibility

**Do NOT add the Connectagram card to `week-MMDDYYYY.html` until after trivia night.**

Connectagram is a printable distributed at the event — it is never published online. Its card should only appear on the week page after the trivia night has occurred.

When creating the week page initially, leave a placeholder comment:
```html
<!-- Connectagram card added after trivia night (YYYY-MM-DD) -->
```

After trivia night, replace the comment with the actual card HTML.

## Weekly trio role

Connectagram is the **printable puzzle** in the weekly trio (same role as Quote Contrary or Word Building). All three puzzles in the week share the same `week` and `published_at` values.

The connection (final answer) should be independently clued by:
- The crossword's theme hint → [implied concept] → connection
- The Find It answer → [implied concept] → connection

## Diversity analysis

Run diversity analysis after recording in DB and set `diversity_vetted_at`:

```js
db.prepare('UPDATE puzzles SET diversity_vetted_at = ? WHERE name = ?')
  .run(Math.floor(Date.now()/1000), 'Connectagram MMDDYYYY');
```

Connectagram clues often reference real people, places, and cultural works — analyze each clue for diversity touchpoints per the `/diversity-tracker` skill.

## Notes

- **Never invent** puzzle content (clues, words, themes, difficulty ratings, circle positions) — always get from the user or existing data
- The generator **shuffles entry display order** based on difficulty tiers. Use `displayOrder` in the JSON to override if the user specifies a fixed order.
- Hyphens in words (e.g. "MERRY-GO-ROUND") count as positions for circle indexing
- All words are stored and compared in UPPERCASE
