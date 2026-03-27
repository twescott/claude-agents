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

## Scoring

Always use `my_score` when querying for word quality or score breakdowns. `score` is Xwi's external score. If `my_score` is NULL for a word, fall back to `score`. In SQL: `COALESCE(my_score, score)`.

## Tag breakdowns

When the user asks for a "tag breakdown" or "breakdown of tags", always show the **combination view**: group by word, concatenate all tags per word, then count how many words share each exact combination. Never show flat per-tag counts as the primary result.

```js
const rows = db.prepare(`
  SELECT combo, COUNT(*) AS n FROM (
    SELECT word, GROUP_CONCAT(category ORDER BY category) AS combo
    FROM word_categories
    GROUP BY word
  )
  GROUP BY combo
  ORDER BY n DESC
`).all();

rows.forEach(r => console.log(r.n.toLocaleString().padStart(8), ' ', r.combo));
```

## User request

$ARGUMENTS
