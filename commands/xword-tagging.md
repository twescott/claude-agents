Tag words in the crossword word database at C:\Users\tiwescot\PersonalAI\words.db.

## Overview

Tags live in `word_categories (word TEXT, category TEXT, PK(word, category))`.
A word can have any number of tags. Tags are additive data points for the regression scoring model.

---

## Tag reference

### Structural tags — from `add_categories.js`

| Tag | Meaning |
|-----|---------|
| `roman_numeral` | Structurally matches Roman numeral pattern (2–15 chars) |
| `abbreviation` | In "Acronyms and Abbr" word list AND has XWI score > 0 |
| `combo_word` | Decomposes into 2+ Oners/proper nouns via DP; or removing first/last letter leaves an Oners word |
| `partial_phrase` | Short (≤5) combo_word with score < 50, not english/proper/abbr/roman/affix |
| `affix` | Appears in the `affixes` table |
| `vulgarity` | In the "Vulgarities" word list |
| `proper_noun` | In Names, Cities, Large towns, Movies, or Literature word lists |

### Language tags — from `fetch_wiktionary.js` + `add_categories.js`

| Tag | Meaning |
|-----|---------|
| `lang:english`, `lang:french`, etc. | Word has an entry in that language on Wiktionary |
| `english_lang` | Shorthand — has `lang:english` |
| `french_lang`, `spanish_lang`, `italian_lang`, `german_lang`, `russian_lang`, `latin_lang`, `yiddish_lang` | Shorthand for named languages |
| `other_lang` | Has a Wiktionary entry in a non-named language |

### Wikipedia disambiguation tags — from `fetch_disambig_categories.js` + `tag_from_wikipedia.js`

Applied only to words with `word_wikipedia.status = 'disambiguation'`.

| Tag | Wikipedia category |
|-----|--------------------|
| `wp:place` | Place name disambiguation pages |
| `wp:surname` | Disambiguation pages with surname-holder lists / Surnames |
| `wp:given_name` | Disambiguation pages with given-name-holder lists |
| `wp:human_name` | Human name disambiguation pages |
| `wp:nickname` | Nicknames / Hypocorisms |
| `wp:masc_given` | Masculine given names |
| `wp:fem_given` | Feminine given names |
| `wp:unisex_given` | Unisex given names |
| `wp:airport` | Airport disambiguation pages |
| `wp:ship` | Ship disambiguation pages |
| `wp:callsign` | Broadcast call sign disambiguation pages |
| `wp:education` | Educational institution disambiguation pages |
| `wp:building` | Church building / Buildings and structures disambiguation pages |
| `wp:station` | Station disambiguation pages |
| `wp:political` | Political party disambiguation pages |
| `wp:county` | County name disambiguation pages |
| `wp:municipality` | Municipality name disambiguation pages |
| `wp:plant` | Plant common name disambiguation pages |
| `wp:animal` | Animal common name disambiguation pages |
| `wp:fish` | Fish common name disambiguation pages |
| `wp:bird` | Bird common name disambiguation pages |
| `wp:genus` | Genus disambiguation pages |
| `wp:taxonomy` | Taxonomy disambiguation pages |
| `wp:language` | Language and nationality disambiguation pages |
| `wp:acronym` | All-caps acronym / Acronyms disambiguation pages |
| `wp:math` | Mathematics disambiguation pages |
| `wp:science` | Science disambiguation pages |
| `wp:biology` | Biology disambiguation pages |
| `wp:technology` | Technology and engineering disambiguation pages |
| `wp:linguistics` | Linguistics disambiguation pages |

---

## Proper noun strategy

Two independent signals identify proper nouns:

**Signal 1 — word list membership** (handled by `add_categories.js`):
Tags `proper_noun` for words in Names, Cities, Large towns, Movies, Literature lists.

**Signal 2 — Wikipedia article + not in Wiktionary**:
Words where `word_languages.source = 'not_found'` AND `word_wikipedia.status = 'article'`
are almost certainly proper nouns (e.g. NVIDIA, KANSAS, BRAHMS).
Tag these as `proper_noun`. Query:
```js
const rows = db.prepare(`
  SELECT wl.word FROM word_languages wl
  JOIN word_wikipedia ww ON ww.word = wl.word
  WHERE wl.source = 'not_found' AND ww.status = 'article'
    AND NOT EXISTS (SELECT 1 FROM word_categories wc WHERE wc.word = wl.word AND wc.category = 'proper_noun')
`).all();
```

**Signal 3 — Wikipedia disambiguation categories** (wp:* tags):
Words like AMAZON (in Wiktionary as a common word, but also a prominent proper noun)
are identified by disambiguation page categories. Key proper-noun signals:
`wp:place`, `wp:surname`, `wp:given_name`, `wp:human_name`, `wp:language`

---

## Frequency data

**Table:** `word_freq (word TEXT PK, zipf REAL)`

Zipf scale: 0 = not found in corpus, 1–2 = very rare, 3–4 = uncommon, 5–6 = common, 7+ = extremely common.

Coverage: complete for lengths 6+. ~16,208 words (mostly lengths 2–5, added after the original
fetch) are missing and should be treated as `zipf_missing` in the model.

**To fill missing words via Datamuse API** (restores lost fetch script):
```js
const Database = require('better-sqlite3');
const https = require('https');
const db = new Database('C:/Users/tiwescot/PersonalAI/words.db');
db.pragma('journal_mode = WAL');

const upsert = db.prepare(`INSERT OR REPLACE INTO word_freq (word, zipf) VALUES (?, ?)`);

const missing = db.prepare(`
  SELECT w.word FROM words w
  LEFT JOIN word_freq wf ON wf.word = w.word
  WHERE wf.word IS NULL
  ORDER BY w.length, w.word
`).all().map(r => r.word);

console.log('Missing:', missing.length);

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchZipf(word) {
  return new Promise(resolve => {
    const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=f&max=1`;
    const req = https.get(url, { headers: { 'User-Agent': 'CrosswordWordDB/1.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j[0] && j[0].word === word && j[0].tags) {
            const ftag = j[0].tags.find(t => t.startsWith('f:'));
            if (ftag) return resolve(parseFloat(ftag.slice(2)));
          }
        } catch {}
        resolve(0);
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

async function main() {
  let done = 0;
  for (const word of missing) {
    const zipf = await fetchZipf(word);
    if (zipf !== null) upsert.run(word, zipf);
    done++;
    if (done % 100 === 0) process.stdout.write(`\r${done}/${missing.length}`);
    await wait(200); // Datamuse rate limit: ~100k/day, ~1/s safe
  }
  console.log('\nDone.');
  db.close();
}

main().catch(e => { console.error(e); db.close(); });
```

---

## Scripts and run order

Run in this order when rebuilding tags from scratch:

| Order | Script | What it does |
|-------|--------|-------------|
| 1 | `import_word_lists.js` | Imports word lists into `word_lists` and `words` tables |
| 2 | `add_categories.js` | Applies structural tags: roman_numeral, abbreviation, combo_word, partial_phrase, affix, vulgarity, proper_noun (from lists), language shorthands |
| 3 | `fetch_wiktionary.js [minLen] [maxLen]` | Fetches Wiktionary data, writes `lang:*` tags to `word_categories` via `word_languages`. Resumable. |
| 4 | `fetch_wikipedia.js [minLen] [maxLen]` | Fetches Wikipedia article/disambiguation status into `word_wikipedia`. Checks abbreviation-tagged words in uppercase. Resumable. Use `--retry` to re-check not_found words. |
| 5 | `fetch_wikipedia_search.js` | Second pass — opensearch for not_found words (e.g. BBKING → B.B. King). Resumable. |
| 6 | `fetch_disambig_categories.js [minLen] [maxLen]` | Fetches Wikipedia categories for disambiguation-page words into `wikipedia_categories`. Resumable. |
| 7 | `tag_from_wikipedia.js` | Maps `wikipedia_categories` → `wp:*` tags in `word_categories`. Idempotent. Re-run any time after step 6 completes more words. |
| 8 | *(inline above)* | Fill missing `word_freq` entries via Datamuse API for ~16K words missing from the table. |
| 9 | *(inline, Signal 2 above)* | Tag `proper_noun` for words with Wikipedia article but not in Wiktionary. |

---

## Notes

- Steps 3–6 are long-running and hit external APIs. Run at 1 req/sec or slower to avoid rate limits. Do not run multiple API scripts concurrently.
- `add_categories.js` skips words of length ≤ 5 for combo_word detection (frozen). Re-run after any word list changes.
- `tag_from_wikipedia.js` is idempotent — safe to re-run as `fetch_disambig_categories.js` processes more lengths.
- `lang:*` and `affix` tags are never deleted by `add_categories.js` rebuild.
- `wp:*` tags cover only words with `word_wikipedia.status = 'disambiguation'`. Article-based proper noun detection (Signal 2) is separate.

## User request

$ARGUMENTS
