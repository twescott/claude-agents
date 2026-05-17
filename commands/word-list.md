# Word List Generator

Generates a Crossword Compiler word list (.txt) from words.db and saves it to CC's Word Lists folder.

## Paths
- **Script:** `C:/Users/tiwescot/PersonalAI/generate-word-list.js`
- **Output dir:** `C:/Users/tiwescot/OneDrive/Crosswords/Word Lists/`
- **Database:** `C:/Users/tiwescot/PersonalAI/words.db` (use `better-sqlite3` via node)

## Score convention
Use effective score: `COALESCE(my_score, score)`. Score tiers: **50** (≥50), **25**, **0**.

## Steps

### 1. Gather parameters

Ask the user for (or confirm defaults):

| Parameter | Prompt | Default |
|-----------|--------|---------|
| Min score | "Minimum score? (50 / 25 / 0)" | 50 |
| Max score | "Maximum score? (50 / 25 / 100)" | 50 |
| Require tags | "Tags to require? (comma-separated, or press enter for none)" | none |
| Exclude tags | "Tags to exclude? (comma-separated, or press enter for none)" | none |
| Output filename | "Output filename? (e.g. My50Plus.txt)" | derived from filters |

**Common tags:** `lang:english`, `proper_noun`, `combo_word`

If the user skips the prompts (provides all info upfront), proceed without asking.

### 2. Run the script

```bash
node C:/Users/tiwescot/PersonalAI/generate-word-list.js \
  --output "<filename>.txt" \
  --min-score <N> \
  --max-score <N> \
  [--require-tags <tag1,tag2>] \
  [--exclude-tags <tag1,tag2>]
```

Omit `--require-tags` / `--exclude-tags` if not specified.

### 3. Report results

Report:
- Number of words written
- Output file path
- Score range and any tag filters applied
- Reminder: CC does not auto-load new `.txt` files — go to **Word Lists > Add** in Crossword Compiler to register it

## Notes
- Output is one uppercase word per line (Windows line endings), sorted A–Z
- The file is placed directly in CC's Word Lists folder, but must be added via **Word Lists > Add** in CC before it is available
- To regenerate with different filters, just rerun with a different filename (or overwrite)

## User request

$ARGUMENTS
