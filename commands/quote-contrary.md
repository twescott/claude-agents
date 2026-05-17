# Quote Contrary Puzzle Generator

Generates a print-ready HTML for a **Quote Contrary** puzzle and optionally uploads it to rebel-the-dog.com.

## What is Quote Contrary?

Each group contains 4 words. Three of them share a connection; one is the **contrary word** — a word (or phrase) from a hidden quote. The solver identifies the contrary word in each group. When all contrary words are assembled in the correct order (plus any **given** words shown directly), they spell out the hidden quote.

## Paths
- **Generator script:** `C:/Users/tiwescot/PersonalAI/generate-quote-contrary.js`
- **Puzzle output dir:** `C:/Users/tiwescot/PersonalAI/rebel-puzzles/`
- **Input JSON:** placed in the output dir or wherever the user specifies

## Input Data Structure

Collect all of the following from the user before generating. **Never invent puzzle content.**

```json
{
  "crosswordSolution": "optional — NOT shown on the puzzle sheet; appears on the answer key as '★ Crossword Puzzle Solution: <value>'",
  "findItSolution":    "optional — NOT shown on the puzzle sheet; appears on the answer key as '★ Find It! Solution: <value>'",
  "hiddenQuote": "THE FULL HIDDEN QUOTE",
  "author":      "optional — who wrote it",
  "speaker":     "optional — who said it (if different from author)",
  "work":        "optional — the work it's from",
  "entries": [
    {
      "quoteWord":  "WORD or PHRASE from the quote (in order)",
      "given":      false,
      "word1":      "DECOY1",
      "word2":      "DECOY2",
      "word3":      "DECOY3",
      "connection": "What word1/word2/word3 share"
    },
    {
      "quoteWord": "ANOTHER",
      "given": true
    }
  ]
}
```

**Rules:**
- `entries` must be in the **same order as the words appear in the hidden quote**
- All `quoteWord` values concatenated (space-separated) must match `hiddenQuote` exactly (normalized: uppercase, punctuation stripped)
- `given: true` — the word is shown directly to the solver in the quote display; no group needed
- `given: false` (or omitted) — the word is hidden; requires `word1`, `word2`, `word3`, and `connection`
- At least one entry must be non-given

## Output format

Quote Contrary puzzles are printed as a round for Trivia Night. The generator produces:
- **Page 1 (puzzle sheet):** "Rebel's Puzzles" brand header, "Quote Contrary" title, "By Rebel's Dad" byline, instructions, groups, "THE QUOTE" section (with source blanks if applicable), feedback section (like/difficulty checkboxes for this puzzle + yes/no for crossword and Find It), drink footer, CC BY-NC-SA 4.0 license — **all on one page**
- **Page 2 (answer key):** groups shown as word boxes with the contrary word circled, hidden quote reveal, source field answers

The footer reads: *"Like the puzzle? Buy Rebel a Pup Cup, or her dad a drink. Find a mistake? Rebel's Dad will buy you a drink (but Rebel would still prefer a Pup Cup)."*

Both an `.html` and a `.pdf` (letter size) are generated. The PDF is the deliverable for printing.

## Steps

### 1. Gather puzzle data

Ask the user to provide all fields. If the user pastes partial data, ask for what's missing.

When collecting entries, confirm:
- All quote words are in quote order
- At least one entry is non-given (contrary)
- Every non-given entry has all 3 decoy words and a connection

### 2. Write the input JSON

Write the data to:
```
C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/quote-contrary-<slug>.json
```
Where `<YYYY-MM-DD>` is the trivia night date for this week and `<slug>` is derived from the theme or first few words of the quote (lowercase, hyphens). Create the dated subfolder if it doesn't exist.

### 3. Generate the HTML and PDF

```bash
node C:/Users/tiwescot/PersonalAI/generate-quote-contrary.js \
  "C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/quote-contrary-<slug>.json" \
  "C:/Users/tiwescot/PersonalAI/rebel-puzzles/<YYYY-MM-DD>/quote-contrary-<slug>"
```

This produces both `quote-contrary-<slug>.html` and `quote-contrary-<slug>.pdf`.

If the script exits with an error, report it to the user and do not proceed.

### 4. Review output

Report back:
- Number of groups (contrary words)
- Number of given words
- Output PDF path (primary deliverable for printing)
- Output HTML path (secondary, for browser preview)
- Confirm the puzzle validated successfully

### 5. Upload (optional)

Ask: "Would you like to upload this to rebel-the-dog.com?"

If yes, follow the **upload-puzzle** skill flow. Puzzle type = `quote-contrary`. For puzzle_clues.db:
- Record the hidden quote as a single entry with `word = <first word of quote>`, `clue = <full hidden quote>`, `difficulty` as supplied by user
- Or skip DB recording if the user prefers — this is a non-crossword puzzle type

## Puzzle Naming Convention

**Only crossword puzzles have thematic titles.** Quote Contrary (and other printable puzzle types) do not get a puzzle title — they are identified by their quote and author only. Never ask the user for a puzzle title for a Quote Contrary.

## Notes

- The generator **shuffles groups and words within each group** randomly on each run. Re-run to get a different shuffle.
- The HTML is print-ready (letter page, 0.5" margins). It also renders in a browser.
- Answer key is on page 2 (after a page break).
- Given words appear as themselves in the quote display; contrary words appear as `__________`. Punctuation (e.g. commas) from `hiddenQuote` is preserved and appended to the appropriate token.
- Quote scoring is **1 point per correct word**. Source attribution (author/speaker/work) is 1 point each.
- The quote section is titled **"THE QUOTE"** (not "THE HIDDEN QUOTE").
- Source fields (author/speaker/work) show as fill-in blanks on the puzzle page and as revealed answers on the answer key.
