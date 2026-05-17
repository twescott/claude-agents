# Diversity Tracker

Records and analyzes cultural diversity touchpoints across puzzle entries. Tracks which cultural groups, demographics, and identities appear in puzzle content (answers and clues).

Data is stored persistently in **puzzle_clues.db** under the following tables: `diversity_categories`, `diversity_entries`, `touchpoint_people`, and `touchpoint_cultural`.

## Paths
- **puzzle_clues.db:** `C:/users/tiwescot/PersonalAI/puzzle_clues.db`

## Database Schema

```sql
-- Categories of cultural/demographic identity
CREATE TABLE IF NOT EXISTS diversity_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  group_type  TEXT NOT NULL,  -- 'racial', 'ethnic', 'national', 'demographic', 'political', 'religious'
  description TEXT,
  created_at  INTEGER DEFAULT (strftime('%s','now'))
);

-- One row per (puzzle_entry, category) touchpoint
-- A single clue/answer pair can have multiple categories
CREATE TABLE IF NOT EXISTS diversity_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_id   INTEGER NOT NULL REFERENCES puzzles(id),
  clue_id     INTEGER NOT NULL REFERENCES clues(id),
  category_id INTEGER NOT NULL REFERENCES diversity_categories(id),
  notes       TEXT,   -- brief explanation of why this category applies
  created_at  INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(puzzle_id, clue_id, category_id)
);

-- Known people/figures for lookup-based diversity tagging
CREATE TABLE IF NOT EXISTS touchpoint_people (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,  -- uppercase grid answer (e.g. OBAMA, CHER)
  gender         TEXT,                  -- 'man', 'woman', 'non-binary', 'unclear'
  race           TEXT,                  -- 'white', 'black', 'latino', 'asian', 'indigenous', 'multiracial', 'unclear'
  lgbtq          INTEGER,               -- 1=yes, 0=no, NULL=unclear
  real           INTEGER DEFAULT 1,     -- 1=real person, 0=fictional
  primary_domain TEXT,                  -- 'Music', 'Film & TV', 'Sports', 'History & Politics', etc.
  notes          TEXT,
  created_at     INTEGER DEFAULT (strftime('%s','now'))
);

-- Known cultural touchpoints for lookup-based diversity tagging
CREATE TABLE IF NOT EXISTS touchpoint_cultural (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  word           TEXT NOT NULL,         -- uppercase grid answer
  category_id    INTEGER NOT NULL REFERENCES diversity_categories(id),
  primary_domain TEXT,
  notes          TEXT,
  created_at     INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(word, category_id)
);
```

**Legacy table:** `diversity_entries_v1` preserves the original data with sentiment for archival. Do not write to it; use `diversity_entries` for all new data.

### Seed categories

Run once to initialize the category list:

```js
const Database = require('better-sqlite3');
const db = new Database('C:/users/tiwescot/PersonalAI/puzzle_clues.db');
db.pragma('foreign_keys = ON');

const ins = db.prepare('INSERT OR IGNORE INTO diversity_categories (name, group_type, description) VALUES (?,?,?)');

db.transaction(() => {
  // Racial
  ins.run('Black/African American', 'racial',     'Black and African American people and culture');
  ins.run('White',                  'racial',     'White people and culture');
  ins.run('Asian',                  'racial',     'Asian people and culture');
  ins.run('Indigenous',             'racial',     'Indigenous, Native American, and First Nations peoples');
  // Ethnic
  ins.run('Latino/Hispanic',        'ethnic',     'Latino/Hispanic culture, people, and history');
  ins.run('Jewish',                 'ethnic',     'Jewish culture, people, and history (ethnicity distinct from religious practice)');
  // Demographic
  ins.run('Men',                    'demographic','Men as a demographic');
  ins.run('Women',                  'demographic','Women as a demographic');
  ins.run('Non-Binary/Gender Non-Conforming', 'demographic', 'Non-binary and gender non-conforming people');
  ins.run('LGBTQ+',                 'demographic','LGBTQ+ people and culture');
  ins.run('Working Class',          'demographic','Working-class and blue-collar identity');
  ins.run('Wealthy/Elite',          'demographic','Wealth, elite class, country clubs, luxury culture');
  ins.run('Immigrants/Refugees',    'demographic','Immigrant and refugee experience');

  // National/regional
  ins.run('United States (general)',     'national',   'US national identity, government, institutions, culture — not tied to a specific demographic subgroup');
  ins.run('Canada',                      'national',   'Canadian culture, people, history, and institutions');
  ins.run('Israel',                      'national',   'Israeli culture, people, history, and politics');
  ins.run('Western Europe',              'national',   'UK, France, Germany, Spain, Italy, and other W. European cultures');
  ins.run('Eastern Europe',              'national',   'Poland, Ukraine, Russia, Balkans, and other E. European cultures');
  ins.run('Latin America',               'national',   'Mexico, Central and South American cultures (outside the US)');
  ins.run('Sub-Saharan Africa',          'national',   'African cultures south of the Sahara');
  ins.run('Middle East/Arab',            'national',   'Arab, Persian, and broader Middle Eastern cultures');
  ins.run('South Asia',                  'national',   'India, Pakistan, Bangladesh, Sri Lanka, and neighboring cultures');
  ins.run('East Asia (general)',         'national',   'East Asian cultures — use specific entries (China, Japan, Korea) when the reference is country-specific');
  ins.run('China',                       'national',   'Chinese culture, people, history, and politics');
  ins.run('Japan',                       'national',   'Japanese culture, people, history');
  ins.run('Korea',                       'national',   'Korean culture, people, history (North and South)');
  ins.run('Southeast Asia',             'national',   'Vietnam, Thailand, Philippines, Indonesia, and neighboring cultures');
  ins.run('Australia/New Zealand',       'national',   'Australian and New Zealand cultures');
  ins.run('Caribbean',                   'national',   'Caribbean island cultures and peoples');

  // Political/ideological
  ins.run('Conservative/Republican/MAGA','political',  'US conservative, Republican, MAGA-aligned political identity or figures');
  ins.run('Progressive/Liberal',         'political',  'US progressive, liberal, or left-leaning political identity or figures');
  ins.run('Religious (Christian)',       'religious',  'Christian faith, churches, Christian cultural references');
  ins.run('Religious (Jewish)',          'religious',  'Jewish faith and religious practice (distinct from ethnic US Jewish)');
  ins.run('Religious (Muslim)',          'religious',  'Islamic faith and Muslim cultural references');
  ins.run('Religious (other)',           'religious',  'Buddhist, Hindu, or other religious traditions');
})();

db.close();
```

## Canonical Category List

These are the exact names as stored in the DB. Use them verbatim when inserting entries.

| Category | Group Type |
|---|---|
| Black/African American | racial |
| White | racial |
| Asian | racial |
| Indigenous | racial |
| Latino/Hispanic | ethnic |
| Jewish | ethnic |
| Men | demographic |
| Women | demographic |
| Non-Binary/Gender Non-Conforming | demographic |
| LGBTQ+ | demographic |
| Working Class | demographic |
| Wealthy/Elite | demographic |
| Immigrants/Refugees | demographic |
| United States (general) | national |
| Canada | national |
| United Kingdom | national |
| Western Europe | national |
| Eastern Europe | national |
| France | national |
| Germany | national |
| Spain | national |
| Italy | national |
| Greece | national |
| Russia | national |
| Israel | national |
| Middle East/Arab | national |
| South Asia | national |
| India | national |
| East Asia (general) | national |
| China | national |
| Japan | national |
| Korea | national |
| Southeast Asia | national |
| Australia/New Zealand | national |
| Latin America | national |
| Mexico | national |
| Caribbean | national |
| Sub-Saharan Africa | national |
| Conservative/Republican/MAGA | political |
| Progressive/Liberal | political |
| Religious (Christian) | religious |
| Religious (Jewish) | religious |
| Religious (Muslim) | religious |
| Religious (Atheism) | religious |
| Religious (other) | religious |

## Lookup-first workflow

When analyzing a puzzle for diversity, follow this order:

1. **Check `touchpoint_people`** for each entry word and each proper noun named in clue text
2. **Check `touchpoint_cultural`** for each entry word
3. **Entries found in the lookup tables** → insert into `diversity_entries` automatically
4. **Entries NOT in lookup tables** → flag for manual review; add to the appropriate table, then insert into `diversity_entries`

This reduces AI judgment to only novel entries not yet in the lookup tables. Once added, they are available for all future puzzles.

### Adding to touchpoint_people

```js
const insPerson = db.prepare(`
  INSERT OR IGNORE INTO touchpoint_people (name, gender, race, lgbtq, real, primary_domain, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
// name: uppercase as it appears in grid or clue (e.g. 'OBAMA', 'BEYONCE')
// gender: 'man', 'woman', 'non-binary', 'unclear'
// race: 'white', 'black', 'latino', 'asian', 'indigenous', 'multiracial', 'unclear'
// lgbtq: 1, 0, or NULL
// real: 1 (real person) or 0 (fictional)
// primary_domain: 'Music', 'Film & TV', 'Sports', 'History & Politics', 'Science & Tech',
//                 'Arts & Literature', 'Geography', 'Food & Drink', 'Everyday Life'
```

### Adding to touchpoint_cultural

```js
const insCultural = db.prepare(`
  INSERT OR IGNORE INTO touchpoint_cultural (word, category_id, primary_domain, notes)
  VALUES (?, ?, ?, ?)
`);
// word: uppercase grid answer (e.g. 'KWANZAA', 'MATZO')
// category_id: from diversity_categories table
// primary_domain: same domain list as above
```

## Inserting entries

```js
const Database = require('better-sqlite3');
const db = new Database('C:/users/tiwescot/PersonalAI/puzzle_clues.db');
db.pragma('foreign_keys = ON');

const getCategory = db.prepare('SELECT id FROM diversity_categories WHERE name = ?');
const getClue     = db.prepare('SELECT id FROM clues WHERE word = ? AND clue = ?');
const getPuzzle   = db.prepare('SELECT id FROM puzzles WHERE name = ?');
const insEntry    = db.prepare(`
  INSERT OR IGNORE INTO diversity_entries (puzzle_id, clue_id, category_id, notes)
  VALUES (?, ?, ?, ?)
`);

db.transaction(() => {
  const puzzleId = getPuzzle.get('And the Winner Is...').id;

  for (const { word, clue, category, notes } of touchpoints) {
    const clueId     = getClue.get(word.toUpperCase(), clue).id;
    const categoryId = getCategory.get(category).id;
    insEntry.run(puzzleId, clueId, categoryId, notes);
  }
})();

db.close();
```

## Reading / reporting

### Per-puzzle breakdown

```js
const db = new Database('C:/users/tiwescot/PersonalAI/puzzle_clues.db', { readonly: true });

const rows = db.prepare(`
  SELECT dc.name as category, dc.group_type,
         c.word, c.clue, de.notes
  FROM diversity_entries de
  JOIN diversity_categories dc ON dc.id = de.category_id
  JOIN clues c ON c.id = de.clue_id
  JOIN puzzles p ON p.id = de.puzzle_id
  WHERE p.name = ?
  ORDER BY dc.group_type, dc.name, c.word
`).all(puzzleName);
```

### Cross-puzzle summary

```js
const rows = db.prepare(`
  SELECT dc.name as category, dc.group_type,
         COUNT(*) as total
  FROM diversity_entries de
  JOIN diversity_categories dc ON dc.id = de.category_id
  JOIN puzzles p ON p.id = de.puzzle_id
  ORDER BY dc.group_type, dc.name
`).all();
```

### Flag conditions

After computing the cross-puzzle summary, flag any category where:
- **A category is completely absent** from 3+ consecutive puzzles — may signal a blind spot
- **A marginalized group never appears** across the full body of work

### Weighting by puzzle type

The crossword always dominates by volume (60–80+ entries vs. a handful for Find It and QC). Do **not** treat all touchpoints as equal weight when assessing balance. Apply this principle:

> **A touchpoint in a Find It answer or QC connection/quote carries proportionally more significance than one of many in the crossword.**

Practically:
- A **Find It answer** is the entire puzzle — one word, one answer. If that word has a cultural identity, that identity *is* the puzzle for that week.
- A **QC connection** is one of a small number of framing statements that every solver reads and processes. A negative or stereotyping connection is more prominent than a single crossword clue buried at 47-Down.
- The **QC quote author** is named explicitly and celebrated — a positive touchpoint there is high-visibility.

This cuts both ways:
- A **problematic** reference in Find It or QC should be flagged at higher severity than the same reference in the crossword, because it has fewer surrounding touchpoints to provide balance.
- A **positive** representation in Find It or QC goes proportionally further than one of many in the crossword. A Find It answer that celebrates an underrepresented group, or a QC quote from a marginalized author, does more diversity work per puzzle than several crossword clues covering the same ground. When assessing the week's overall balance, weight positive non-crossword touchpoints accordingly — they punch above their volume.

## Tracking analysis status with `diversity_vetted_at`

The `puzzles` table has a `diversity_vetted_at` column (unix timestamp):
- **NULL** — diversity analysis has not been run for this puzzle yet
- **Set** — analysis is complete, even if no touchpoints were found

Always set `diversity_vetted_at` after completing analysis:
```js
db.prepare('UPDATE puzzles SET diversity_vetted_at = ? WHERE name = ?').run(Math.floor(Date.now()/1000), puzzleName);
```

A puzzle with `diversity_vetted_at` set and zero `diversity_entries` rows is **intentionally sparse** — not unanalyzed. Find It! puzzles typically fall into this category.

## Running a diversity analysis

When the user invokes `/diversity-tracker` (or asks for a diversity analysis):

1. Ask which puzzle(s) to analyze, or confirm cross-puzzle summary
2. For each entry word and each proper noun in clue text, check `touchpoint_people` and `touchpoint_cultural`
3. Insert matched touchpoints into `diversity_entries` automatically
4. Flag any entries not found in lookup tables — add them to the appropriate table, then insert
5. Pull and print a table per puzzle showing: word | clue | category | notes
6. Print the cross-puzzle summary table
7. Flag any conditions from the Flag conditions section above
8. Note which categories from the canonical list have **never appeared** across all puzzles
9. After inserting all entries, set `diversity_vetted_at` on the puzzle

## Adding new entries

When recording a new puzzle's diversity touchpoints:

1. Check lookup tables first — matched entries need no AI judgment
2. For entries not in the lookup tables: identify applicable categories and write a brief notes string explaining the connection
3. Add to `touchpoint_people` or `touchpoint_cultural` as appropriate
4. Insert into `diversity_entries` using the pattern above

A single entry can and often will map to multiple categories. Example: a clue about AOC maps to both `Latino/Hispanic` and `Women` and `Progressive/Liberal`.

### Completeness rule — never skip base demographic categories

**Every person referenced in an answer or clue (real or fictional) must be tagged for ALL applicable categories — not just the culturally "interesting" ones.** The base demographic categories (Men, Women, Black/African American, White, Asian, etc.) are as important to the cross-puzzle analysis as the specific cultural categories.

**Mandatory tags for every person:**
- **Gender**: tag Men, Women, or Non-Binary/Gender Non-Conforming — always, for every person
- **Race/ethnicity**: tag the appropriate racial category (Black/African American, White, Asian, Indigenous, Latino/Hispanic) — always, for every person whose race is publicly known

These tags must be added even when the gender or race of a person is not the primary reason for the entry's cultural interest. If you tag DRE as Black/African American, you must also tag DRE as Men. If you tag ASHLEY (Judd) as Women, you must also tag ASHLEY as White.

**Verification step**: after inserting all entries for a puzzle, query the Men and Women counts and confirm they account for all people referenced in the puzzle. A puzzle with 10 named people should have roughly 10 Men + Women entries total (adjusted for non-binary and unclear cases).

```js
// Quick completeness check after inserting
const genderCheck = db.prepare(`
  SELECT dc.name, COUNT(*) as cnt
  FROM diversity_entries de
  JOIN diversity_categories dc ON dc.id = de.category_id
  WHERE de.puzzle_id = ? AND dc.name IN ('Men','Women','Non-Binary/Gender Non-Conforming')
  GROUP BY dc.name
`).all(puzzleId);
console.log('Gender entries:', genderCheck);
// Total should match number of distinct people referenced
```

## Quote Contrary diversity analysis

QC puzzles have three distinct sources of cultural touchpoints — analyze all three:

### 1. The quote's author/speaker/work

This is often the strongest touchpoint. Who said or wrote this? What is their cultural identity? What is the work's cultural context?

Example: A quote by Langston Hughes → US Black/African American ✅; a quote from the Quran → Religious (Muslim) ◻️/✅; a quote by Winston Churchill → Western Europe ◻️.

If the quote is a proverb or anonymous, note that — no person touchpoint applies, but the proverb's cultural origin may still be relevant.

### 2. The group connections

The connection statement ("What word1/word2/word3 share") is the most overlooked diversity source. A connection can invoke a cultural group directly or implicitly.

Examples:
- "Car rental companies" → United States (general) ◻️ (Dollar, Budget, Enterprise are all US companies)
- "Traditionally Black Greek-letter fraternities" → US Black/African American ✅
- "French wines" → Western Europe ◻️
- "K-pop groups" → Korea ✅
- "Things ICE agents do" → Conservative/Republican/MAGA ❌; US Immigrants/Refugees (sympathetic) ✅
- "Jewish holidays" → Religious (Jewish) ◻️

Analyze the connection text itself, not just the decoy words. The connection is the clue that tells solvers what the decoys share — it's where cultural framing lives.

### 3. The decoy words themselves

Individual decoy words can carry cultural touchpoints independent of the connection, especially when they are proper nouns (people, places, brands, works).

Example: DOLLAR, BUDGET, ENTERPRISE in the "Car rental companies" group — these are all US brands; the cultural touchpoint is on the connection, but ENTERPRISE also references the Star Trek ship (US pop culture ◻️).

### Recording QC touchpoints in the DB

QC puzzles are recorded with a single clue row per puzzle (the full hidden quote). For diversity purposes, record touchpoints against this row using the `notes` field to specify which aspect (author, connection, decoy) the touchpoint comes from.

Alternatively, for richer tracking, use `notes` to distinguish:
- `notes: "Author: [name] — [identity]"`
- `notes: "Connection: '[connection text]' — [reasoning]"`
- `notes: "Decoy: [word] — [reasoning]"`

### Week 1 QC example — "A Fool and His Money Are Soon Parted"

| Source | Content | Category | Notes |
|---|---|---|---|
| Quote | Anonymous proverb | — | No attributed author; origin unclear |
| Connection | "Car rental companies" (DOLLAR, BUDGET, ENTERPRISE) | United States (general) | All three are US-headquartered brands |
| Connection | "Unknown elements" (JOKER, X-FACTOR, WILDCARD) | — | No cultural touchpoint |
| Connection | "Abbreviations" (PDQ, STAT, ASAP) | — | No cultural touchpoint |
| Connection | "Past-tense math operations" | — | No cultural touchpoint |

**Result**: Week 1 QC adds only one weak touchpoint (United States general ◻️). The puzzle is culturally sparse — the quote's anonymity and the abstract connections (math, abbreviations) leave little room for cultural representation.

## Notes

- A puzzle entry's **word alone** is sometimes enough to assign a category; the **clue context** provides additional precision
- Always check both the answer word and the full clue text for cultural touchpoints
- Check `touchpoint_people` and `touchpoint_cultural` lookup tables before doing any manual classification
