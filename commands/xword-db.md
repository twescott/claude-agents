Query the crossword word database at C:\Users\tiwescot\PersonalAI\words.db.

## Database access

Always use `better-sqlite3` via node. Never use the sqlite3 CLI. Example pattern:

```js
const Database = require('better-sqlite3');
const db = new Database('C:/Users/tiwescot/PersonalAI/words.db', { readonly: true });
```

Run queries from any working directory by using the full path to the DB.

## Schema

```
words        (word TEXT PK, score INTEGER, length INTEGER, status TEXT, my_score INTEGER, special TEXT)
word_lists   (word TEXT, list_name TEXT, PK(word, list_name))
word_categories (word TEXT, category TEXT, PK(word, category))
affixes      (affix TEXT PK, type TEXT, real_word INTEGER, notes TEXT)
```

Tags are stored in `word_categories` as a many-to-many relationship — a word can have any number of tags.

## Word set breakdown format

When the user asks for a "breakdown" of a word set, show a **Score × Tags table**:

- Rows grouped by score tier (50, 25, 0) with a subtotal per tier
- Tags column uses the **simplified** combination of: `combo_word`, `lang:english`, `proper_noun` — ignore other specific lang: tags, collapse them to `other` if none of the three key tags apply
- Sort within each score tier by count descending
- Show a row total after each score tier block
- Use a markdown table

Tag simplification logic:
```js
function simplify(combo) {
  if (combo === '(no tags)') return '(no tags)';
  const parts = combo.split(',');
  const isEnglish = parts.includes('lang:english');
  const isProper  = parts.includes('proper_noun');
  const isCombo   = parts.includes('combo_word');
  const bits = [];
  if (isCombo)   bits.push('combo_word');
  if (isEnglish) bits.push('lang:english');
  if (isProper)  bits.push('proper_noun');
  if (!isCombo && !isEnglish && !isProper) bits.push('other');
  return bits.join(', ');
}
```

## Score convention

When the user asks about "score", use **`my_score` if set, otherwise fall back to `score`** (the source score).

```js
COALESCE(w.my_score, w.score) as eff_score
```

Score tiers: **50** (score ≥ 50), **25**, **0** (anything else). Never show ranges like "25–49" or "1–24".

## Unique constraint — collision-safe updates

The `clues` table has a **UNIQUE constraint on `(word, clue)`**. Any script that normalizes `word` or `clue` (trimming whitespace, converting rebuses, renaming, etc.) must handle collisions **before** touching the DB — not reactively after hitting a constraint error.

**Required pattern for any bulk normalization:**
```js
for each row to update:
  compute new value (trimmed clue, converted word, etc.)
  check: SELECT id FROM clues WHERE word=? AND clue=? AND id != thisId
  if collision exists:
    migrate clue_subjects: INSERT OR IGNORE INTO clue_subjects SELECT newId, subject_id ...
    migrate puzzle_entries: UPDATE puzzle_entries SET clue_id=newId WHERE clue_id=thisId
    DELETE clue_subjects WHERE clue_id=thisId
    DELETE FROM clues WHERE id=thisId
  else:
    UPDATE clues SET word/clue=newValue WHERE id=thisId
```

Never use a single bulk `UPDATE` on `word` or `clue` without a pre-flight collision check. A transaction-wrapped bulk UPDATE will rollback entirely on the first violation.

## Rebus and non-alpha word conversion

Words in the `clues` table must be **pure A–Z**. Any word containing non-letter characters is an encoded rebus or theme entry that needs conversion before being stored. Apply these rules whenever inserting or encountering such a word:

| Encoding | Rule | Examples |
|---|---|---|
| Slash rebus (`A/B`) | Use the `canonical_word` value (strip spaces & apostrophes) | `BASA/IL` → `BASIL`, `DOTTHEI/DOTS` → `DOTTHEIS` |
| PH/F rebus | Use canonical (PH and F collapse to the real word) | `ALPH/FA` → `ALPHA`, `ELPH/F` → `ELF` |
| UP/DOWN rebus | Use canonical (primary reading wins) | `FACEUP/DOWN` → `FACEUP`, `UP/DOWNSIDE` → `UPSIDE` |
| Digit(s) | Spell out the number | `24KMAGIC` → `TWENTYFOURKMAGIC`, `FAB4` → `FABFOUR` |
| Hyphen | Remove it | `NON-SPORTING` → `NONSPORTING` |

If converting a word would collide with an existing `(word, clue)` pair (UNIQUE constraint on `clues`), **migrate** any `clue_subjects` from the encoded entry to the canonical entry, then delete the encoded duplicate.

## Word review rules

When reviewing words and setting `my_score`:
- **Only three values are valid: 0, 25, or 50.** Never assign any other value.
- **Always update `status` to `active`** at the same time as setting `my_score`. Never set a score without also marking the word active.
- Present words in batches of 20. Always query with `OFFSET 0` (not a running offset) since reviewed words drop out of the result set as they're marked active.

## User request

$ARGUMENTS
