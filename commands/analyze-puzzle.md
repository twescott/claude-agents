# Analyze Crossword Puzzle

Reviews a crossword puzzle for quality issues before publishing: crosswordese, weak fill, proper nouns, dangerous crossings, and diversity.

Can also run a cross-puzzle diversity report across all published puzzles. Pass `--all` to run the cross-puzzle report only (no .ipuz needed).

## Editorial Standards

The constructor's editorial standards are **loose when it comes to dark or sad content**. Do not flag entries or clues solely because they reference difficult topics (violence, terrorism, tragedy, controversy, etc.). The constructor is comfortable clueing entries like ISIS with a direct reference to the terrorist organization. Flag factual errors and broken clues — not editorial tone.

## Audience
All puzzles on rebel-the-dog.com are for a **local Seattle audience**. This means:
- Seattle-specific proper nouns (neighborhoods, local businesses, local figures) are **acceptable and welcome**
- Non-Seattle local references (e.g. a dispensary only known in Portland) are **not acceptable**
- National brands, well-known pop culture, geography, and public figures are fine

### Growlerz Trivia Night
Puzzles distributed at Growlerz Trivia Night have a more specific audience. **Growlerz is a dog park that serves drinks — not a pub or bar.** The crowd is Seattle-area dog owners and their friends:
- Dog-related content is highly relevant and especially welcome
- Seattle sports teams (Mariners, Seahawks, Kraken, Sounders) are fine as broadly relevant Seattle culture, but no more so than for any other Seattle audience
- The crowd is **casual-to-moderate** trivia players, not hardcore trivia nerds
- **Do not guess or infer the demographic makeup of the Growlerz audience.** Describe what is observed in the puzzle content; do not speculate about what the audience likely looks like, prefers, or votes for.

## Paths
- **Parser:** `C:/Users/tiwescot/PersonalAI/parse-ipuz.js`
- **words.db:** `C:/Users/tiwescot/PersonalAI/words.db`
- **puzzle_clues.db:** `C:/Users/tiwescot/PersonalAI/puzzle_clues.db`
- **Crosswords folder:** `C:/Users/tiwescot/OneDrive/Crosswords/`
- **Growlerz puzzles:** `C:/Users/tiwescot/OneDrive/Crosswords/Growlerz/`
  - Week folders: `Growlerz/YYYY-MM-DD/` named by Wednesday trivia night date
  - All puzzle files for the week (`.ccw`, `.ipuz`, `.puz`, PDFs, etc.) belong in the week folder, renamed to match the internal puzzle title.
  - If no week folder exists yet, look for new puzzle files in the Growlerz root. When found: create the week folder, move all associated files in (renamed to match the internal puzzle title), and delete the originals from the root.
  - Always extract the puzzle title from the `.ipuz` metadata — never assume it matches the filename.
- **Export format:** `.ipuz` only (remind user if they offer .puz)

## Steps

### 0. Check for changes (always do this first)

**Always re-parse the .ipuz before analyzing** — never rely on a previously generated puz-output.json or cached context. The file may have changed since the last session.

If a prior analysis exists for this puzzle, diff the new parse against the old one and report what changed before running the full analysis. Only entries that changed need re-evaluation; unchanged entries carry over from the prior analysis.

```js
// Save previous parse if it exists, then re-parse
// cp puz-output.json puz-output-prev.json
// node parse-ipuz.js <path>.ipuz > puz-output.json
// Then diff entries: compare word + clue for each number+dir key
```

After each analysis, save the parsed output as a named baseline for cross-session diffing:
```
C:/Users/tiwescot/PersonalAI/puz-baseline-<puzzle-slug>.json
```
e.g. `puz-baseline-and-the-winner-is.json`. On the next analysis of the same puzzle, diff against this baseline first, then overwrite it.

### 1. Parse the puzzle

```
node C:/Users/tiwescot/PersonalAI/parse-ipuz.js "<path>.ipuz" > puz-tmp.json
```

Then load with Node + better-sqlite3.

### 2. Extract all entries

```js
const puz = JSON.parse(fs.readFileSync('puz-tmp.json'));
const across = puz.across.map(e => ({
  word: e.cells.map(c => puz.grid[c.row][c.col].solution).join(''),
  number: e.number, dir: 'A', clue: e.clue, cells: e.cells
}));
const down = puz.down.map(e => ({
  word: e.cells.map(c => puz.grid[c.row][c.col].solution).join(''),
  number: e.number, dir: 'D', clue: e.clue, cells: e.cells
}));
const all = [...across, ...down];
```

### 3. Look up tags in puzzle_clues.db

Before doing any AI classification, check whether the clue is already tagged:

```js
const pdb = new Database('C:/Users/tiwescot/PersonalAI/puzzle_clues.db', { readonly: true });
const getClue = pdb.prepare(`
  SELECT id, domain, age_tier, wordplay, proper_noun_type, difficulty
  FROM clues WHERE word = ? AND clue = ?
`);
// Also fetch all existing tagged clues for the same word (used as AI context)
const getSiblings = pdb.prepare(`
  SELECT clue, domain, age_tier, wordplay, proper_noun_type
  FROM clues WHERE word = ? AND (domain IS NOT NULL OR age_tier IS NOT NULL OR wordplay IS NOT NULL)
`);

for (const e of all) {
  const row = getClue.get(e.word, e.clue);
  if (row && row.domain) {
    // Tags already exist — use them, no AI needed
    e.domain    = row.domain;
    e.age_tier  = row.age_tier;
    e.wordplay  = row.wordplay;
    e.pnType    = row.proper_noun_type;
    e.tagged    = true;
  } else {
    // Not yet tagged — collect sibling clues as context for AI
    e.siblings = getSiblings.all(e.word);
    e.tagged   = false;
  }
}
```

For untagged entries, pass the sibling clues as context when prompting AI classification. A word with 5 existing tagged clues needs much less reasoning than one never seen before.

After AI assigns tags, write them back:
```js
const pdbWrite = new Database('C:/Users/tiwescot/PersonalAI/puzzle_clues.db');
const upsertClue = pdbWrite.prepare(`
  INSERT INTO clues (word, clue, domain, age_tier, wordplay, proper_noun_type, source)
  VALUES (?, ?, ?, ?, ?, ?, 'growlerz')
  ON CONFLICT(word, clue) DO UPDATE SET
    domain           = COALESCE(excluded.domain, domain),
    age_tier         = COALESCE(excluded.age_tier, age_tier),
    wordplay         = COALESCE(excluded.wordplay, wordplay),
    proper_noun_type = COALESCE(excluded.proper_noun_type, proper_noun_type)
`);
```

Only update tags that were previously NULL — never overwrite an existing tag.

### 4. Check each entry against words.db

```js
const db = new Database('C:/Users/tiwescot/PersonalAI/words.db', { readonly: true });
const getWord = db.prepare(`
  SELECT w.word, w.score, w.my_score, w.status,
         GROUP_CONCAT(DISTINCT wc.category) as cats
  FROM words w
  LEFT JOIN word_categories wc ON wc.word = w.word
  WHERE w.word = ?
  GROUP BY w.word
`);
// IMPORTANT: words.db stores all words in lowercase.
// Always lowercase the entry before querying: getWord.get(word.toLowerCase())
```

Categories to flag from words.db:
- `proper_noun`, `wp:person`, `wp:place` → **proper noun**
- `abbreviation` → **abbreviation** (note: the DB tags many entries; use as a signal, not a verdict)

For entries not in words.db (compounds, multi-word phrases), analyze manually from the clue.

**Note:** There is no `crosswordese` tag in words.db. Crosswordese detection is entirely heuristic — see step 4.

### 4. Flag crosswordese and weak fill

There are no crosswordese tags in the database. Flag entries using these heuristics, applied to the word and its clue:

**Colloquial phrase fill** — multi-word phrases rendered as a single entry (IMIN, IDARESAY, ONAUTO, FLEWIN) are **assets**, not weak fill, when they read naturally as something a real person would say. Do NOT flag these. The test: would a native speaker use this phrase in conversation? If yes, it's good fill.

**Partials** — the entry is a fragment of a longer phrase and can only be clued with a fill-in-the-blank:
- Examples: IMA ("___ Little Teapot"), ASAN ("___ aside"), ITIS ("so ___ written")
- Signal: clue text contains `___`, or the entry has no standalone meaning without the surrounding phrase

**Plural abbreviations** — entry ends in S and the base form is an abbreviation with no other usage:
- Examples: PTAS (Parent-Teacher Associations), ABBRS
- Signal: base word (drop S) has `abbreviation` tag in DB, is a known initialism, and has no other standalone meaning
- Note: ATS is a modern colloquial verb ("she @s him" = notifies on social media) — do not flag it as a plural abbreviation

**Common crosswordese fill** — short words that appear constantly in grids because of their letter patterns but are weak vocabulary:
- French/Latin words used as fill: EAU, ETRE, ESSE, ALAE, OLES, ALEE, ERNE, ESNE, OTIC, OLEO, etc.
- Exclamations: RAH, OLE, AHA, OOH, UGH — flag if clued generically (not tied to a specific cultural reference)
- Archaic/poetic English: ERE, OFT, EEN, NEATH, AFOOT, AHORSE
- Flag these but note if the clue elevates them (a clever clue for EAU is better than "Water, in France")

**Abbreviations as entries** — three-letter initialisms or acronyms:
- Examples: TNT, RNA, DNA, NACL, DIY, GDP, GPS
- Flag all; note if the clue is educational/interesting or if the entry was forced by the grid

**Low-score entries** — check `my_score` in words.db; if `my_score` is set and below 35, flag it:
```js
const row = getWord.get(word.toLowerCase());
if (row && row.my_score !== null && row.my_score < 35) {
  // flag as low-quality per constructor's own rating
}
```

### 5. Identify proper nouns

Classify each proper noun:
- **Person** — real or fictional
- **Place** — city, region, country, fictional location
- **Brand/product** — corporate names, product lines
- **Organization** — gov agencies, clubs, businesses

Note: **Seattle-local proper nouns are acceptable** (see Audience section above).

### 6. Find crossing proper nouns (Natick check)

A **Natick** is when two proper nouns cross at a single letter where neither entry provides a fallback for solvers who don't know one of them.

```js
// For every pair of (across proper noun, down proper noun), check shared cells
for (const a of properNounEntries.filter(e => e.dir === 'A')) {
  for (const d of properNounEntries.filter(e => e.dir === 'D')) {
    for (const ac of a.cells) {
      for (const dc of d.cells) {
        if (ac.row === dc.row && ac.col === dc.col) {
          // Report crossing
        }
      }
    }
  }
}
```

**Assessing risk — use score when available, judgment otherwise:**

First, look up each proper noun in words.db:
```js
const row = getWord.get(word.toLowerCase());
// score scale is 0–60; average word scores ~15
// score ≥ 50 → high-frequency / likely familiar to solvers
// score 30–49 → moderate frequency
// score < 30 (or not in DB) → lower frequency / potentially obscure
```

Many proper nouns won't be in words.db at all (they weren't in the Xw source word list). When score is unavailable, fall back to judgment — but be explicit that it's a judgment call, not a computed result.

**Risk levels for crossings:**
- **High** — neither entry has a score in DB, or one is hyper-local (non-Seattle) crossing something niche; a solver who doesn't know one has no way to infer the crossing letter
- **Medium** — one entry has score ≥ 50 or is broadly culturally ubiquitous; a solver who knows one can likely work out the other
- **Low** — both entries have score ≥ 50, or both are independently well known from mainstream culture (e.g. major brands, continents, top-tier celebrities)

Do not flag proper nouns as "politically charged" — politicians, activists, and public figures are fair game just like any other person.

### 7. Print the grid

Always print the grid for visual context:

```js
for (let r = 0; r < puz.height; r++) {
  let row = r.toString().padStart(2) + ' ';
  for (let c = 0; c < puz.width; c++) {
    const cell = puz.grid[r][c];
    row += cell.black ? '# ' : (cell.solution || '.') + ' ';
  }
  console.log(row);
}
```

### 8. Diversity analysis

This analysis has three parts: **knowledge domains**, **people diversity**, and **geographic/cultural diversity**. All run per-puzzle and can also be run across all puzzles (see Cross-puzzle section below).

#### Knowledge domains

For every entry (word + clue together), assign it a **primary domain** and note any **secondary domains** it also activates. The clue context drives primary classification — the same word can belong to different domains depending on how it's clued.

> **Example:** KOREA clued as "BTS's home country" → primary Music, secondary Geography. KOREA clued as "Split nation since 1953" → primary History & Politics, secondary Geography. The word is the same; the clue determines the domain.

Domains:
- **Music** — artists, songs, albums, genres, instruments
- **Film & TV** — movies, shows, characters, directors, actors
- **Sports** — athletes, teams, games, venues
- **History & Politics** — historical events, eras, political figures, governments
- **Science & Tech** — chemistry, biology, physics, computers, medicine
- **Arts & Literature** — books, authors, visual art, theater, poetry
- **Geography** — places, countries, cities, landmarks (when the clue is geographic, not biographical)
- **Food & Drink** — cuisine, cooking, restaurants, ingredients
- **Everyday Life** — common objects, activities, concepts, idioms, puns, wordplay, and linguistic entries that don't fit elsewhere

#### Domain tiers and weighting

Domains are split into two tiers. Tier 1 domains carry 50% more weight than Tier 2:

| Tier | Weight | Domains |
|------|--------|---------|
| 1 | 1.5 | Music, Film & TV, Sports, History & Politics, Arts & Literature |
| 2 | 1.0 | Geography, Food & Drink, Science & Tech |
| — | excluded | Everyday Life |

**Primary domain:** each entry contributes `TIER_WEIGHT × word_length_in_squares` to its primary domain bucket. A 14-letter entry carries proportionally more weight than a 3-letter entry.

**Secondary domains:** each entry also contributes **0.5 × primary tier weight × word length** to any secondary domain it activates (0.75×wlen for T1 primaries, 0.5×wlen for T2 primaries). Secondary domain contributions from EL-primary entries are excluded.

**Baseline expected %** (assuming equal distribution across 8 non-EL domains):
- T1 domain baseline: 1.5 / (5×1.5 + 3×1.0) = 1.5/10.5 = **14.3%**
- T2 domain baseline: 1.0 / 10.5 = **9.5%**

**Flag threshold** = baseline + 1 SD, where SD = sqrt(p × (1−p) / n), **n = total non-EL cells** (sum of word lengths for all non-EL-primary entries):
- T1 flag threshold ≈ 14.3% + sqrt(0.143×0.857/n)
- T2 flag threshold ≈ 9.5% + sqrt(0.095×0.905/n)

Report the breakdown as a weighted table (domain → primary weight → secondary weight → total weight → % of total weighted). Note which domains are absent. List entries that carry secondary domain weight below the table.

#### Domain clustering (section lock-out check)

A solver locked out of a domain can still complete the rest of the puzzle — unless multiple domain-specific entries cluster in the same grid section and cross each other. When that happens, a solver who lacks that domain knowledge cannot get a foothold in that corner even if they know everything else in the puzzle.

**How to detect:**

For each pair of entries assigned to the same non-Everyday-Life domain, check whether they share any crossing cells (i.e., an across entry and a down entry from the same domain intersect). If two or more same-domain entries cross within a confined area, flag it as a **domain cluster**.

```js
// Group entries by domain, then check crossings within each domain group
for (const domain of Object.keys(domainMap)) {
  if (domain === 'Everyday Life') continue;
  const group = domainMap[domain]; // entries in this domain
  const acrossGroup = group.filter(e => e.dir === 'A');
  const downGroup = group.filter(e => e.dir === 'D');
  for (const a of acrossGroup) {
    for (const d of downGroup) {
      for (const ac of a.cells) {
        for (const dc of d.cells) {
          if (ac.row === dc.row && ac.col === dc.col) {
            // Same-domain entries cross — flag as cluster
          }
        }
      }
    }
  }
}
```

Also check for **adjacent same-domain entries** that don't directly cross but sit in the same corner (all cells within a ~5×5 bounding box). A solver might be able to infer crossing letters from crossings with other entries, but if 3+ domain entries all sit in the same corner, the risk is higher even without direct crossings.

**Risk levels for domain clusters:**
- **High** — two or more entries from the same specific sub-domain (e.g., both Star Wars) cross directly; a non-fan has no way to complete that crossing
- **Medium** — same domain but broad enough that general knowledge might suffice (e.g., two "classic rock" entries); or 3+ same-domain entries in the same corner without direct crossings
- **Low** — same domain but both entries are independently very well known (score ≥ 50); the domain is merely a bonus, not a requirement

Note the difference from the Natick check: a Natick is two *any* proper nouns crossing with an obscure letter. A domain cluster can occur even with well-known proper nouns — the issue is that a solver who lacks that one domain of knowledge is locked out of a section entirely.

#### People diversity

Scan all entries **and all clue text** for references to real or fictional people. Include:
- Answers that are a person's name (NINA, OMAR, KENOBI)
- Clues that name a person even if the answer is not their name ("Katy Perry hit" → Katy Perry is referenced)

For each person identified, record:
- **Name** (as referenced)
- **Context** (answer or clue)
- **Gender** — man, woman, non-binary, or unclear. Base on public identity. When unclear, say so rather than guessing.
- **Race/ethnicity** — based on public self-identification or widely documented background. Use broad categories (e.g. Black, white, Latino/a, Asian, Indigenous, multiracial). When unclear or not publicly documented, say "unclear."
- **LGBTQ+** — note if the person is publicly out (gay, lesbian, bisexual, trans, non-binary, etc.), based on public self-identification only. For fictional characters, note if they are canonically LGBTQ+ as depicted. Mark "unclear" or omit if not publicly documented. Note: LGBTQ+ touchpoints can be embedded in clue *phrasing*, not just the answer word — e.g. "shirtless Sulu" references both a factual detail and a recognized gay cultural touchpoint around George Takei.
- **Real or fictional**

Then report:
- Gender breakdown (counts + %) — include men, women, and non-binary/GNC as separate counts. Do not qualify gender by nationality (a Swedish man and a US man are both "men"). The DB categories for gender are **Men**, **Women**, and **Non-Binary/Gender Non-Conforming**.
- Race/ethnicity breakdown (counts + %)
- LGBTQ+ representation — note any LGBTQ+ people referenced
- List any people marked "unclear" so the constructor can decide how to classify them

##### Reference count thresholds (per-puzzle and cross-puzzle)

**All thresholds use the binomial proportion formula — per-puzzle and `--all` mode alike:**

> **flag threshold = baseline ± sqrt(p × (1−p) / n)**

Where:
- `p` = baseline for the group (see table below). **Baselines reflect American English speakers, not the full US population** — since the crossword is in English, the relevant reference population is Americans who speak English fluently or dominantly. This lowers the Latino/Hispanic and Asian baselines relative to their general-population share.
- `n` = total people references in the current analysis window (per-puzzle: all weighted refs in that puzzle; `--all` mode: season-total weighted refs)
- Use `baseline + formula` for over-representation flags; `baseline − formula` for under-representation flags

**Compute n before applying thresholds.** Thresholds are not pre-calculated — they vary by puzzle size (per-puzzle) or by how many weeks have accumulated (`--all` mode). A small puzzle with only 8 people refs will have wide thresholds; a full season with 500+ refs will have narrow ones.

**Asymmetric logic:** Over-representation of privileged groups and under-representation of marginalized groups are both problems to **flag**. Under-representation of privileged groups and over-representation of marginalized groups are worth noting but not flagging.

These thresholds apply to reference counts.

Racial categories cover all people of that background regardless of nationality — e.g., "Asian" includes Asians, East Asians, South Asians, Central Asians, etc. Nationality is handled by the geographic diversity checks, not the racial/identity categories.

| Group | Baseline `p` | Direction | Action |
|-------|-------------|-----------|--------|
| Men *(privileged)* | 49% | over → | **FLAG** if > p + sqrt(p×(1−p)/n) |
| Men *(privileged)* | 49% | under → | note if < p − sqrt(p×(1−p)/n) |
| Women *(marginalized)* | 51% | under → | **FLAG** if < p − sqrt(p×(1−p)/n) |
| Women *(marginalized)* | 51% | over → | note if > p + sqrt(p×(1−p)/n) |
| Non-Binary/GNC *(marginalized)* | 1.2% | — | track presence (n too small to threshold) |
| White *(privileged)* | 60% | over → | **FLAG** if > p + sqrt(p×(1−p)/n) |
| White *(privileged)* | 60% | under → | note if < p − sqrt(p×(1−p)/n) |
| Black/African American | 13% | under → | **FLAG** if < p − sqrt(p×(1−p)/n) |
| Black/African American | 13% | over → | note if > p + sqrt(p×(1−p)/n) |
| Latino/Hispanic | 13% | under → | **FLAG** if < p − sqrt(p×(1−p)/n) |
| Latino/Hispanic | 13% | over → | note if > p + sqrt(p×(1−p)/n) |
| Asian | 5% | — | track presence; note if > p + sqrt(p×(1−p)/n) |
| LGBTQ+ | 8% | under → | **FLAG** if < p − sqrt(p×(1−p)/n) |
| LGBTQ+ | 8% | over → | note if > p + sqrt(p×(1−p)/n) |
| Jewish | 2% | — | track presence (n too small to threshold) |
| Indigenous | 1% | — | track presence (n too small to threshold) |

"Track presence" means the expected count is too small to threshold statistically at typical puzzle sizes — note if the group appears at all rather than measuring proportion.

##### Consecutive-week gap thresholds

For smaller groups, track the number of consecutive weeks without any reference and flag if the gap exceeds the threshold. Thresholds are set at the 5% probability level — the number of consecutive absent weeks that has only a 5% chance of occurring by random sampling.

| Group | P(appear/week) | Expected gap | **Flag if gap >** |
|-------|---------------|-------------|-------------------|
| LGBTQ+ | 66% | 0.5 wks | **3 weeks** |
| Asian | 58% | 0.7 wks | **4 weeks** |
| Jewish | 25% | 3.0 wks | **11 weeks** |
| Non-Binary/GNC | 18% | 4.5 wks | **15 weeks** |
| Indigenous | 17% | 4.9 wks | **17 weeks** |

Track the current gap (weeks since last appearance) for each group as puzzles are published. Reset to 0 when the group appears.

**Note:** Do not cross-tabulate gender with nationality or ethnicity. Gender and race/ethnicity are reported as separate, independent dimensions. Nationality/country categories are only used for geographic and cultural diversity analysis, not for intersecting with gender or race.

**Important notes on this analysis:**
- Use publicly documented identity only. Do not infer race/ethnicity or LGBTQ+ identity from names, appearance, or roles alone.
- Fictional characters: use the character's identity as depicted (e.g. EWOK — non-human, skip; KENOBI — fictional white man as depicted in Star Wars).
- The goal is awareness and balance, not a strict quota. Flag imbalances as "worth noting" not "errors."
- **Lookup-first:** check `touchpoint_people` and `touchpoint_cultural` before doing any AI analysis. Matched entries need no judgment — insert from the lookup table. Only novel entries require manual classification.

#### Age accessibility

The Growlerz Trivia Night audience spans **early 20s to retirees**. Every section of the grid should have at least one "entry point" clue accessible to each generation — a solver who's locked out of one entry should be able to get a foothold from a neighboring clue.

**Age groups** (as of 2026):
- **Gen Z** (born ~1997–2007, ~19–29): smartphone-native, streaming, gaming, TikTok, memes, post-2010 pop culture, internet slang (AFK, NOOB, NFT, YEETS)
- **Millennial** (born ~1982–1996, ~30–44): 90s–2000s nostalgia, Harry Potter, early internet/Y2K, 2000s film and music
- **Gen X** (born ~1967–1981, ~45–59): 80s childhood, classic rock, early MTV, 80s–90s film and TV
- **Boomer+** (born before ~1966, ~60+): pre-1980 culture, classic crossword fill, WWII/Vietnam era, 50s–70s pop culture, classic literature and art

**Classification rules:**

For each entry + clue pair, ask: **does this entry have a generationally distinctive cultural association that creates differential solvability by age?**

- If **no** → **NG** (non-generational). Includes:
  - Content-neutral words with no cultural associations (LIEU, ACELA)
  - Entries whose cultural associations span all ages so evenly that no cohort has a meaningful advantage (the Bible, universally famous historical figures like NAPOLEON)
  - Common vocabulary, tennis scoring, grammar terms, etc.

- If **yes** → classify into the tightest tier that fits:
  - **Y** (Younger: Gen Z + Millennial) — internet slang, streaming-era content, post-2010 cultural references
  - **M** (Middle: Millennial + Gen X) — 90s–2000s references, broad pop culture spanning those decades
  - **O** (Older: Gen X + Boomer+) — pre-1990 cultural references, classic crosswordese, historical figures who peaked before the internet era
  - **Y+M** — spans Younger and Middle (e.g. early internet, Harry Potter, 2000s–2010s culture)
  - **M+O** — spans Middle and Older (e.g. classic rock, 80s–90s culture with lasting recognition)
  - **Y+M+O** — the entry carries *distinct* generational touchpoints that make it accessible to each cohort for *different* reasons. This is not "universally known" (that is NG) — it is an entry where a Gen Z solver, a Gen X solver, and a Boomer solver could each arrive at the answer via separate cultural hooks. Example: "Titular musician in a Weezer song" for BUDDY HOLLY — the Weezer song (M) and Buddy Holly himself (O) are different anchors; a Y solver may know either the song or the musician from different exposure paths, giving it a third distinct hook.

**Counting:** All entries — including NG and Y+M+O — are included in the denominator. NG and Y+M+O entries each contribute n/3 cells to Y, n/3 to M, and n/3 to O. Y+M entries contribute n/2 to Y and n/2 to M. M+O entries contribute n/2 to M and n/2 to O. Pure-tier entries contribute n to their tier. Denominator = total cells across all entries.

*Rationale: including NG entries at 1/3 each ensures the sample size is large enough for meaningful statistics. NG entries are genuinely neutral — they neither help nor hurt any generation — and distributing them evenly reflects that.*

**Effective baselines:** Because NG entries contribute 1/3 to each tier (rather than 25/50/25), including them shifts the expected distribution. Flag against effective baselines that account for this dilution:

```
ngRatio  = ngCells / totalCells
genRatio = 1 − ngRatio
bY_eff   = ngRatio × (1/3) + genRatio × 0.25
bM_eff   = ngRatio × (1/3) + genRatio × 0.50
bO_eff   = ngRatio × (1/3) + genRatio × 0.25   (same as bY_eff)
SD       = sqrt(b_eff × (1 − b_eff) / totalCells)
flag if observed% > b_eff + SD
```

Compute effective baselines separately for each quadrant using that quadrant's own NG and total cell counts.

**Examples for calibration:**
- "Wimbledon love" for ZERO → NG (tennis scoring is broadly known, no age skew)
- "Inexperienced gamer" for NOOB → Y
- "BRB alternative" for AFK → Y
- "Tosses, in modern slang" for YEETS → Y
- "Emma who played Hermione" for WATSON → Y+M (Harry Potter skews Millennial/Gen Z)
- "1972 hit for Eric Clapton" for LAYLA → O (classic rock)
- "Surrealist Spanish painter" for DALI → NG (Dalí is universally known)
- "Kidnapping victim in 'The Nightmare Before Christmas'" for SANTA → Y+M (90s film, enduringly popular with those cohorts)
- "Some Dadaist works" for ARPS → O (art history, crossword-familiar)
- "Early 2020's fad among crypto bros" for NFT → Y
- "Lawman Earp" for WYATT → M+O (Western lore skews older; Gen X knew it from TV)
- "Catwoman player Kitt" for EARTHA → O (Eartha Kitt's Catwoman was 1966–1968 TV)
- "Titular musician in a Weezer song" for BUDDY HOLLY → Y+M+O (distinct anchors: Weezer=M, Buddy Holly=O, crossover paths for Y)
- "A green one is said to be an aphrodisiac" for MANDM → Y+M+O (Y/O: recognize M&Ms as a candy; M: know the specific 90s aphrodisiac meme — different routes to the same answer)

**Per-quadrant check:**

Classify **all entries** (including Everyday Life) by age tier — EL entries are not automatically NG. An entry like POV ("Online abbr. indicating a specific perspective") is Y even though its domain is Everyday Life.

For each quadrant, list which entries fall into each tier. Then flag:
- **Any quadrant with no Older-specific entries** (no O, M+O, or Y+M+O entries, only NG) — a retiree has no culturally familiar foothold in that section beyond filler
- **Any quadrant with no Younger-specific entries** (no Y, Y+M, or Y+M+O entries, only NG) — a Gen Z solver has no culturally familiar foothold
- **Overall imbalance** — flag if any single generation tier (Y / M / O) exceeds baseline + 1 SD:
  - baselines: Y = 25%, M = 50%, O = 25%
  - n = total cells across all entries (NG contribute n/3 to each tier; Y+M+O contribute n/3 to each; Y+M, M+O, pure tiers as above)
  - SD = sqrt(p × (1−p) / n) using each tier's baseline p
  - flag threshold = baseline + SD for that tier
  - Per-quadrant: same formula using only entries starting in that quadrant

Report as a table: quadrant → NG count / Y / M / O counts (with proportionate splits shown), with flags noted. List the generation-specific (non-NG) entries so the constructor can see where the gaps are.

#### Geographic/cultural diversity

This is distinct from the Geography knowledge domain (factual knowledge about places) and from people diversity (which individuals appear). It asks: **whose culture shows up?** Whose food, music, art, customs, language, and history are woven into the puzzle — and whose are absent?

The audience is primarily American, so US-centric content is expected. The goal is not equal global representation but **awareness of blind spots**: a puzzle that references only white Western culture across every entry is worth noting, especially across multiple weeks.

**For each entry + clue, note any cultural touchpoint it activates:**

| Region/Culture | Examples |
|---|---|
| US (general) | American idioms, brands, history, pop culture — tag liberally; US references are often invisible because they feel like the default |
| Latin America & Caribbean | Cuban music, Colombian food, Carnival |
| Western Europe | Shakespeare, French cuisine, British history |
| Eastern Europe | Ballet, classical composers, Cold War history |
| Middle East & North Africa | Arabic words, Islamic tradition, regional history |
| Sub-Saharan Africa | African languages, music, history |
| South Asia | Indian cuisine, Bollywood, Sanskrit-origin words |
| East Asia | K-pop, anime, Chinese history, Japanese cuisine |
| Southeast Asia | Thai food, Filipino culture, etc. |
| Oceania | Australian slang, Māori culture, etc. |

**Classification rules:**
- Note the culture/region, not just the geographic fact. GYRO clued as "Mediterranean food" → Greek/Middle Eastern food culture touchpoint. GYRO clued as "Device that measures rotation" → Science & Tech, no cultural touchpoint.
- A single entry can activate multiple cultural touchpoints (e.g. AFROS clued via Jimi Hendrix + Diana Ross = two Black American music figures).
- **Tag creators of closely associated works.** When a clue references a work (film, book, musical, song, etc.) that is closely associated with a specific creator, include the creator's identity in the diversity analysis — even if the creator is not named in the clue. Example: "Medicine taken in 'Rent'" → tag Jonathan Larson (white male) in addition to the LGBTQ+ content of the show. The test: would a typical solver *immediately and specifically* think of the creator when reading this clue? If the solver thinks of the work or its characters first (e.g. SpongeBob before Stephen Hillenburg), the creator is not salient enough to tag.
- **Tag all people referenced in clue text**, including those referenced indirectly (e.g. "President who followed and was followed by Harrison" references both Grover Cleveland and Benjamin Harrison). If the clue makes a person identifiable, tag them.
- **Tag US references liberally.** American idioms, brands, TV shows, historical figures, sports teams, and institutions are US cultural touchpoints even when they feel like the default. Under-tagging US content distorts the US% metric.
- When a reference belongs to both a country and its parent region (e.g. something specifically Japanese vs. broadly East Asian), tag the specific country only — not both.

##### Geographic target percentages and flags

Target: **50% of geographic references should be US**. This is adjustable as the season develops.

**US concentration flag:** Flag if US references exceed **60%** of all geographic tags in a given analysis window.


**Impact scores and targets** — each region/country's cultural footprint in the US, used to set expected non-US reference rates. Non-US references are split across regions proportional to impact score (total non-US impact: 177 points).

| Region/Country | Impact | % of all refs (target) | % of non-US refs |
|----------------|--------|----------------------|-----------------|
| United States | *(baseline)* | 50.0% | — |
| United Kingdom | 18 | 4.2% | 8.5% |
| Japan | 16 | 3.8% | 7.5% |
| Mexico | 15 | 3.5% | 7.1% |
| India | 13 | 3.1% | 6.1% |
| France | 11 | 2.6% | 5.2% |
| China | 11 | 2.6% | 5.2% |
| Korea | 11 | 2.6% | 5.2% |
| Russia | 10 | 2.4% | 4.7% |
| Italy | 9 | 2.1% | 4.2% |
| Canada | 9 | 2.1% | 4.2% |
| Israel | 9 | 2.1% | 4.2% |
| Caribbean | 9 | 2.1% | 4.2% |
| Germany | 8 | 1.9% | 3.8% |
| Middle East/Arab | 8 | 1.9% | 3.8% |
| Sub-Saharan Africa | 7 | 1.7% | 3.3% |
| Southeast Asia | 7 | 1.7% | 3.3% |
| Spain | 7 | 1.7% | 3.3% |
| Greece | 6 | 1.4% | 2.8% |
| Latin America (excl. Mexico) | 6 | 1.4% | 2.8% |
| Australia/New Zealand | 6 | 1.4% | 2.8% |
| Western Europe (excl. UK/FR/DE/IT/GR/ES) | 5 | 1.2% | 2.4% |
| South Asia (excl. India) | 4 | 0.9% | 1.9% |
| Eastern Europe (excl. Russia) | 4 | 0.9% | 1.9% |
| East Asia (excl. China/Japan/Korea) | 3 | 0.7% | 1.4% |

##### Consecutive-week gap thresholds

Based on 12 geographic refs/week average and 5% probability level. Flag if the region has been absent for more than this many consecutive weeks.

| Region/Country | P(appear/wk) | **Flag if gap >** |
|----------------|-------------|------------------|
| United Kingdom | 42% | **6 weeks** |
| Japan | 38% | **7 weeks** |
| Mexico | 36% | **8 weeks** |
| India | 32% | **9 weeks** |
| France | 27% | **10 weeks** |
| China | 27% | **10 weeks** |
| Korea | 27% | **10 weeks** |
| Russia | 25% | **11 weeks** |
| Italy | 22% | **12 weeks** |
| Canada | 22% | **12 weeks** |
| Israel | 22% | **12 weeks** |
| Caribbean | 22% | **12 weeks** |
| Germany | 20% | **14 weeks** |
| Middle East/Arab | 20% | **14 weeks** |
| Sub-Saharan Africa | 18% | **16 weeks** |
| Southeast Asia | 18% | **16 weeks** |
| Spain | 18% | **16 weeks** |
| Greece | 15% | **18 weeks** |
| Latin America (excl. Mexico) | 15% | **18 weeks** |
| Australia/New Zealand | 15% | **18 weeks** |
| Western Europe (excl. UK/FR/DE/IT/GR/ES) | 13% | **22 weeks** |
| South Asia (excl. India) | 11% | **27 weeks** |
| Eastern Europe (excl. Russia) | 11% | **27 weeks** |
| East Asia (excl. China/Japan/Korea) | 8% | track presence |

**Cross-puzzle (`--all` mode):** Report which regions have never appeared across the full body of work. Report current gap (weeks since last appearance) for every region against its threshold.

#### Religious diversity

Tracked as a **separate dimension** from geographic/cultural diversity and from people diversity.

**What counts as a religious reference:**
- The religion itself, its practices, texts, symbols, or institutions (Hanukkah, the Quran, a mosque, the Trinity, karma)
- Religious leaders whose identity is inseparable from the religion (the Pope, the Dalai Lama, an Imam)
- Cultural concepts that originate from a specific faith tradition (kosher, jihad, confession, nirvana)
- **Does NOT count:** a person who happens to follow a religion, unless the religion itself is the subject of the clue

**The Jewish distinction:** A Jewish person gets a `Jewish` racial/identity tag under people diversity. A reference to Judaism as a religion (Torah, Passover, a rabbi) gets a `Religious (Jewish)` tag under religious diversity. A clue about a Jewish person's faith would get both.

**Categories tracked:**
- Religious (Christian)
- Religious (Jewish)
- Religious (Muslim)
- Religious (other) — Buddhism, Hinduism, Sikhism, etc.
- Religious (Atheism) — atheism, secularism, non-belief, anti-theism

**Reporting:** Present religious diversity as a **note only** — never a flag. Report which traditions appear and which are absent. Do not set thresholds or flag imbalances as problems.

#### Political diversity

Track references to Conservative/Republican/MAGA and Progressive/Liberal perspectives using the existing DB categories. Present findings as a **note only** — never a flag or problem. Report the direction of any skew (e.g., "all political references this week were progressive-coded") for awareness, not correction.

## Weekly trio analysis

### Naming convention

Each weekly trio is formally named after its **crossword title**. Example: the Week 1 trio is called **"In the Beginning..."**, not "Week 1." Use the crossword title when referring to the trio in any report or summary.

### Theme chain

Both the crossword's hint answer AND the Find It answer should each independently clue the printout puzzle's primary answer. The chain is:

> **Crossword theme hint → [implied concept] → printout answer**
> **Find It answer → [implied concept] → printout answer**

Example (Week 1 / "In the Beginning..."):
- Crossword hint: APRILFIRST → April 1st = April Fools' Day → hints the quote is about fools → "A Fool and His Money Are Soon Parted"
- Find It answer: SCAMS → what fools fall for → same quote

Both paths should lead to the same destination. When assessing theme coherence, evaluate each path independently: does the crossword hint work on its own? Does the Find It answer work on its own?

### Puzzle types and what to analyze in each

**puzzle_clues.db — URL conventions:**
- Crosswords and Find It! puzzles have URLs (hosted on rebel-the-dog.com).
- Printable trivia puzzles (Quote Contrary, Connectagram) do not have URLs — `url = null` is expected and should never be flagged.

**Find It!** — always has exactly one `puzzle_entries` row, which is the theme word by default. `is_theme` does not need to be set.

**Connectagram** — when storing or auditing clues in `puzzle_clues.db`:
- The 7 clue entries are just clues — `is_theme` should NOT be set on them. The theme (the final connection answer, e.g. "DOG SHOW GROUPS") is stored in `puzzles.theme`, not as a `puzzle_entries` row.
- Cross-references in clues use a **position-reference template**: `Opposite of #{WORD}`, where `{WORD}` is the answer of the referenced clue. Example: `Opposite of #{SPORTING}`.
- At render/print time, `{WORD}` is resolved to that word's position number in the puzzle. This prints as e.g. `Opposite of #5`.
- Never hardcode a position number in the stored clue — positions are layout-dependent and will break if the puzzle is reordered.

**Crossword** — full analysis: all 10 sections (Natick, proper nouns, crosswordese, diversity, wordplay, proofreading). The richest content for diversity analysis.

**Find It** — limited analysis. The answer word contributes to:
- Theme coherence (does it clue the printout puzzle independently?)
- Word reuse tracking (see Cross-week patterns below) — the Find It answer is a single high-visibility word; flag if it has appeared in any prior crossword or Find It puzzle
- Cultural analysis: the word and the concept it invokes both count

**Printout trivia puzzle (Quote Contrary, etc.)** — analyze all groups, decoy words, connection labels, and the hidden quote/phrase. For Quote Contrary specifically:
- Each group's connection label, its 3 decoy words, and its contrary word are all entries for diversity analysis
- The **hidden quote itself** is cultural content: note its origin (author, era, culture), language, and whether it centers any particular cultural perspective. A 16th-century English proverb, a Shakespeare line, a hip-hop lyric, and a Confucian saying all carry different cultural weight.
- People referenced in connection labels, decoys, or the quote count toward people diversity
- **The quote author is a named subject.** If the QC JSON has an `author` field, that person must be recorded as their own `clues` entry (e.g. `BENJAMINFRANKLIN`) and added to `puzzle_entries`, with diversity tags anchored to that entry — not to any quote word. The author's name as displayed on the puzzle is the anchor.

### Weekly trio diversity report

After analyzing individual puzzles, produce a **weekly summary** that aggregates across all three:

**Calendar appropriateness:** Note whether the trio's theme aligns with the trivia night date. Two levels:
- `calendar:exact` — the theme is specifically tied to the exact date of the trivia night (e.g. "In the Beginning..." played *on* April 1st, April Fools' Day)
- `calendar:approximate` — the themed date falls within 7 days of the trivia night (e.g. a Halloween theme played within one week of October 31st)
If neither applies, no calendar tag is needed. This is a feature to celebrate, not a requirement — but track it so patterns across the body of work are visible.

**Theme coherence:** Evaluate both the crossword-hint path and the Find It path independently. Does each one, on its own, clearly clue the printout puzzle's primary answer?

**Aggregated domain distribution:** Combine all entries from all three puzzles. Same 35% flag threshold applies to the aggregate.

**Aggregated cultural touchpoints:** Which cultures/regions appear across the full week? Flag if the entire week has no non-US-mainstream touchpoints. Note where different puzzles in the week complement each other. Include the cultural origin of the printout puzzle's quote/phrase.

**Aggregated people diversity:** Combine all people referenced across all three puzzles. Flag persistent imbalances.

**Compensation check:** Note explicitly where one puzzle's gap is covered by another (e.g. if the crossword has no Latin American touchpoints but the QC's decoy words include Spanish-origin terms).

### Cross-week patterns (`--all`)

**Run the script — do not execute these steps manually:**

```
node C:/Users/tiwescot/PersonalAI/meta-analysis.js
# or for specific weeks:
node C:/Users/tiwescot/PersonalAI/meta-analysis.js --weeks=1,2,3,4
```

`meta-analysis.js` implements all steps below algorithmically using only DB tags. Re-running after adding a new week's diversity data takes seconds. The script follows the step order and flag thresholds defined below — if the spec and script ever diverge, update the script to match the spec.

**Do not** re-analyze words or re-read .ipuz files for the `--all` run. All domain, age_tier, and diversity data is read from puzzle_clues.db.

---

When called with `--all`, run the full meta-analysis across all published puzzles in puzzle_clues.db. Execute every step below in order. Do **not** evaluate theme coherence (crossword-hint / Find It path) — that belongs to the weekly trio report only.

**Including an unpublished puzzle in `--all`:** If the current puzzle is not yet in puzzle_clues.db, its diversity data must be derived by re-parsing the `.ipuz` baseline and systematically iterating every entry word-by-word. Do NOT reconstruct from session memory, analysis narratives, or prior summaries — entries will be missed (e.g. short Down entries that don't appear in written summaries). Use the parsed JSON as the authoritative source.

**Prominence weights:** crossword ×1 · find-it ×3 · quote-contrary ×3 · connectagram ×3

Apply these weights to every count and score calculation. A diversity_entry in a QC puzzle counts 3× in all aggregates.

```js
const db = new Database('C:/Users/tiwescot/PersonalAI/puzzle_clues.db', { readonly: true });

// Base query: all diversity entries across all published weeks.
// Uses the subjects system (clue_subjects → subject_categories).
// Direct subject categories count at full weight (rel_weight=1.0).
// Related subject categories (via subject_relationships) count at half weight (rel_weight=0.5).
// Example: FARGO's clue directly surfaces Frances McDormand (White/Women at 1.0×)
//          and the Fargo work, whose created_by relationship points to the Coen Brothers
//          (White/Jewish/Men at 0.5× each).
const deRows = db.prepare(`
  -- Direct subject categories
  SELECT p.week, p.name as puzzle, p.type,
         c.word, c.clue, dc.name as category, dc.group_type,
         CASE p.type
           WHEN 'crossword'       THEN 1
           WHEN 'find-it'         THEN 3
           WHEN 'quote-contrary'  THEN 3
           WHEN 'connectagram' THEN 3
           ELSE 1
         END as puzzle_weight,
         1.0 as rel_weight
  FROM clue_subjects cs
  JOIN clues c ON c.id = cs.clue_id
  JOIN puzzle_entries pe ON pe.clue_id = c.id
  JOIN puzzles p ON p.id = pe.puzzle_id
  JOIN subject_categories sc ON sc.subject_id = cs.subject_id
  JOIN diversity_categories dc ON dc.id = sc.category_id
  WHERE p.published_at IS NOT NULL

  UNION ALL

  -- Related subject categories at 0.5 weight
  SELECT p.week, p.name as puzzle, p.type,
         c.word, c.clue, dc.name as category, dc.group_type,
         CASE p.type
           WHEN 'crossword'       THEN 1
           WHEN 'find-it'         THEN 3
           WHEN 'quote-contrary'  THEN 3
           WHEN 'connectagram' THEN 3
           ELSE 1
         END as puzzle_weight,
         0.5 as rel_weight
  FROM clue_subjects cs
  JOIN clues c ON c.id = cs.clue_id
  JOIN puzzle_entries pe ON pe.clue_id = c.id
  JOIN puzzles p ON p.id = pe.puzzle_id
  JOIN subject_relationships sr ON sr.subject_id = cs.subject_id
  JOIN subject_categories sc2 ON sc2.subject_id = sr.related_id
  JOIN diversity_categories dc ON dc.id = sc2.category_id
  WHERE p.published_at IS NOT NULL
  ORDER BY week, type, word
`).all();
```

Weighted count for an entry = `puzzle_weight × rel_weight`.

---

#### Step 1 — Diversity Audit

Before running any analysis, verify the DB is current. Check for any puzzle entries that are completely untagged (no clue_subjects rows at all) in crossword puzzles:

```js
db.prepare(`
  SELECT p.week, p.name, c.word, c.clue
  FROM puzzle_entries pe
  JOIN puzzles p ON p.id = pe.puzzle_id
  JOIN clues c ON c.id = pe.clue_id
  WHERE p.type = 'crossword' AND p.published_at IS NOT NULL
    AND c.clue != ''
    AND NOT EXISTS (
      SELECT 1 FROM clue_subjects cs WHERE cs.clue_id = c.id
    )
  ORDER BY p.week, c.word
`).all();
```

Report how many untagged entries remain per puzzle. If there are untagged entries that clearly warrant tags (people, places, cultures, religions), note them for follow-up — but do not block the analysis. Proceed with whatever tags exist.

---

#### Step 2 — People Diversity

**2a. Gender reference counts**

Filter `deRows` to `group_type = 'demographic'` and `category IN ('Men','Women','Non-Binary/Gender Non-Conforming')`. Sum weighted counts per category.

Compute `total_gender = sum of all three weighted counts`. Set `n = total_gender` for threshold calculations.

**All thresholds use the binomial formula: flag = baseline ± sqrt(p×(1−p)/n).** Compute thresholds from n before filling in the table.

| Group | Wtd Count | % of gender | Threshold | Action |
|---|---|---|---|---|
| Men *(privileged)* | — | — | FLAG if > 49% + sqrt(.49×.51/n); note if < 49% − formula | — |
| Women *(marginalized)* | — | — | FLAG if < 51% − sqrt(.51×.49/n); note if > 51% + formula | — |
| NB/GNC *(marginalized)* | — | — | track presence | — |

Report per-week breakdown (unweighted, for trend visibility).

**2b. Race/ethnicity reference counts**

Filter to `category IN ('White','Black/African American','Latino/Hispanic','Asian','Indigenous','Jewish')`. Set `n = total race refs`.

**Thresholds computed via binomial formula (same as gender above).**

| Group | Wtd % | Baseline p | Threshold | Action |
|---|---|---|---|---|
| White *(privileged)* | — | 60% | FLAG if > p + sqrt(p×(1−p)/n) | — |
| Black/African American | — | 13% | FLAG if < p − sqrt(p×(1−p)/n) | — |
| Latino/Hispanic | — | 13% | FLAG if < p − sqrt(p×(1−p)/n) | — |
| Asian | — | 5% | track presence | — |
| Indigenous | — | 1% | track presence | — |
| Jewish | — | 2% | track presence | — |

**2c. LGBTQ+ representation**

Filter to `category = 'LGBTQ+'`. Report weighted count and % of total gender-weighted refs. Set `n = total gender-weighted refs`. Flag if actual% < 8% − sqrt(.08×.92/n); note if absent for 3+ consecutive weeks.

**2d. Consecutive-week gap checks**

For each small group, find the most recent week in which it appeared. If the current week minus last-appeared week exceeds the threshold, flag it.

| Group | Gap threshold |
|---|---|
| LGBTQ+ | 3 weeks |
| Asian | 4 weeks |
| Jewish | 11 weeks |
| NB/GNC | 15 weeks |
| Indigenous | 17 weeks |

**2e. Narrow-channel check**

For groups that appear in every week, check whether all their appearances flow through the same knowledge domain. Flag if a marginalized group has appeared in 3+ consecutive weeks but all appearances are via the same single domain (e.g. Black/AA only via Music).

---

#### Step 3 — Geographic/Cultural Diversity

**3a. Regional counts**

Filter `deRows` to `group_type = 'national'`. Sum weighted counts per region/country.

Compute `total_geo = sum of all weighted national counts`.

Compute `us_pct = weighted count for 'United States (general)' / total_geo`.

**Flag: US% > 60%**

Also report per-week US% for trend visibility.

**3b. Compare each region to target %**

Target: US = 50% of all geo refs. Non-US pool = 50%, split proportionally by impact score:

| Region/Country | Impact | Target non-US% | Target of total% |
|---|---|---|---|
| United Kingdom | 18 | 8.5% | 4.2% |
| Mexico | 15 | 7.1% | 3.5% |
| Japan | 13 | 6.1% | 3.1% |
| India | 13 | 6.1% | 3.1% |
| China | 12 | 5.7% | 2.8% |
| Canada | 10 | 4.7% | 2.4% |
| Russia | 10 | 4.7% | 2.4% |
| Israel | 9 | 4.2% | 2.1% |
| Caribbean | 9 | 4.2% | 2.1% |
| Italy | 9 | 4.2% | 2.1% |
| Germany | 8 | 3.8% | 1.9% |
| Korea | 8 | 3.8% | 1.9% |
| Middle East/Arab | 8 | 3.8% | 1.9% |
| Sub-Saharan Africa | 7 | 3.3% | 1.7% |
| Latin America | 6 | 2.8% | 1.4% |
| Greece | 6 | 2.8% | 1.4% |
| Australia/New Zealand | 6 | 2.8% | 1.4% |
| France | 6 | 2.8% | 1.4% |
| Eastern Europe | 4 | 1.9% | 0.9% |
| South Asia | 4 | 1.9% | 0.9% |
| Spain | 4 | 1.9% | 0.9% |
| Southeast Asia | 3 | 1.4% | 0.7% |
| Western Europe (general) | 5 | 2.4% | 1.2% |
| East Asia (general) | 4 | 1.9% | 0.9% |

Report actual % vs. target % and delta for every region.

**3c. Sentiment flag per region**

For each region with >5 weighted references:
- `avg_score = sum(adjusted_score × weight) / sum(weight)`
- **Flag if avg_score < 1.0**

**3d. Consecutive-week gap check**

For each region, find the most recent week in which it appeared. Flag if current gap exceeds threshold:

| Region/Country | Gap threshold (weeks) |
|---|---|
| United States | 1 |
| United Kingdom | 5 |
| Mexico | 6 |
| Japan | 6 |
| India | 6 |
| China | 10 |
| Canada | 10 |
| Israel | 10 |
| France | 10 |
| Korea | 10 |
| Russia | 7 |
| Caribbean | 7 |
| Germany | 8 |
| Italy | 8 |
| Middle East/Arab | 8 |
| Sub-Saharan Africa | 9 |
| Latin America | 9 |
| Greece | 9 |
| Australia/New Zealand | 9 |
| Western Europe (general) | 11 |
| South Asia | 13 |
| East Asia (general) | 13 |
| Spain | 14 |
| Eastern Europe | 16 |
| Southeast Asia | 16 |

Report never-appeared regions separately. Note those approaching their gap threshold.

---

#### Step 4 — Knowledge Domains

Domain percentages are **cell-weighted** (each entry's tier weight × word length in squares). n for the SD formula = total non-EL cell count (not entry count).

**Flag threshold = baseline + 1 SD** where SD = sqrt(p × (1−p) / n):
- T1 baseline = 1.5/10.5 = 14.3%; T2 baseline = 1.0/10.5 = 9.5%
- Per-puzzle: n = that puzzle's non-EL cells → threshold varies by puzzle size
- Series: n = total non-EL cells across all weeks → threshold tightens as weeks accumulate

**This formula governs ALL threshold types in this skill** — domains, people diversity (gender, race, LGBTQ+), age, and any other proportional metric. Never use fixed pre-calculated thresholds. Always compute from n in the current analysis window.

**Flags:**
- Any domain > baseline + 1 SD in any single puzzle: FLAG
- Same domain > baseline + 1 SD across the full series: FLAG

The script (`meta-analysis.js`) computes both automatically. Report per-week % breakdown + series totals. Note any domain absent from the entire series.

---

#### Step 5 — Age Accessibility

For this step, classify every crossword entry by accessibility tier: NG / Y / M / O / Y+M / M+O / Y+M+O. Use prior classifications where available; classify new entries fresh.

Compute series totals and per-week breakdown. NG and Y+M+O entries each contribute n/3 to Y, M, and O. Y+M contributes n/2 to Y and M. M+O contributes n/2 to M and O. Denominator = total cells across all entries. Use effective baselines (adjusted for NG ratio) for flag thresholds — see single-puzzle analysis for formula.

**Flags:**
- Any single tier (Y / M / O) > effective baseline + 1 SD across the series: FLAG
- Any single week with no Older-specific entries (O + M+O + Y+M+O, excluding NG): note (flag if 3+ consecutive weeks)
- Any single week with no Younger-specific entries (Y + Y+M + Y+M+O, excluding NG): note (flag if 3+ consecutive weeks)

Also run the per-quadrant foothold check for the most recent puzzle — see the single-puzzle analysis Age Accessibility section.

---

#### Step 6 — Word/Theme Reuse

Run all checks in a single DB pass:

```js
// Themes and printout types
db.prepare(`SELECT week, type, name, theme FROM puzzles WHERE published_at IS NOT NULL ORDER BY week`).all();

// Words appearing in more than one crossword with the same clue
db.prepare(`
  SELECT c.word, c.clue, COUNT(DISTINCT pe.puzzle_id) as npuz,
         GROUP_CONCAT(p.name || ' (Wk' || p.week || ')') as puzzles
  FROM clues c
  JOIN puzzle_entries pe ON pe.clue_id = c.id
  JOIN puzzles p ON p.id = pe.puzzle_id
  WHERE p.published_at IS NOT NULL AND c.clue != ''
  GROUP BY c.word, c.clue
  HAVING npuz > 1
`).all();

// Find It answers
db.prepare(`SELECT week, theme FROM puzzles WHERE type='find-it' AND published_at IS NOT NULL ORDER BY week`).all();
```

**Flags:**
- Two weeks sharing the same theme or hidden answer/quote: FLAG
- Same printout type in consecutive weeks: FLAG
- Duplicate clue text (same word, same clue) across any two puzzles: FLAG
- Find It answer reused from any prior puzzle: FLAG (hard block)

**Not a flag:** Duplicate clue text for two different entries within the same puzzle. Using the same clue for two different answers (e.g. "That's nonsense!" for both PFFT and FIE) is an acceptable stylistic choice within a single grid.

Note (not flag): same printout type appearing non-consecutively; same word with different clues.

---

#### Step 7 — Printable Puzzle Type Variety

List all printout types used per week. Flag if only one type has been used across the entire series (no variety at all). Note if any single type has been used in more than two-thirds of all weeks.

---

#### Step 8 — Summary

Produce a prioritized flags table:

| Priority | Flag | Section | Notes |
|---|---|---|---|
| 1 | … | … | … |

List all flags from Steps 1–7 in priority order:
1. Hard blocks (Find It reuse, theme duplication)
2. Under-representation of marginalized groups (race/ethnicity count)
3. Sentiment/ratio flags for privileged groups scoring too high
4. Geographic concentration
5. Structural/design notes (printable variety, age gaps, narrow channels)

End with a **Non-Flag Observations** paragraph summarizing notable trends, consecutive-week patterns for small groups, and any regions approaching their gap thresholds.

### 9. Difficulty distribution

Rate every clue **easy / medium / hard** based on independent judgment. Ratings are constructor-assigned when stored in `puzzle_clues.db`; otherwise Claude assigns them and notes that they are Claude-assigned.

**Criteria:**
- **Easy** — direct synonym, fill-in-the-blank with an obvious answer, or widely known proper noun with a clear clue. The solver should get this quickly.
- **Medium** — requires specific knowledge (historical event, niche brand, regional reference), a slight twist, or a colloquial term that may be unfamiliar to some. **Cross-reference clues ("See X-Down", "Like the answer to X-Across", etc.) are always at least Medium** — they require solving another entry first before this one can be confirmed.
- **Hard** — genuine wordplay/misdirection (clue reads one way, answer is another), very specialized knowledge, archaic vocabulary, or a double entendre that requires catching the second meaning. **Important:** misdirection must live in the *clue*, not the answer. If the answer word is ambiguous but the clue is direct and unambiguous, that is not wordplay — it is a straight clue to one of the answer's meanings.

#### Quadrant breakdown

Use the **cell-weighted quadrant averaging** algorithm (same as wordplay distribution — see that section for the full implementation). For difficulty, `ratingOf` returns 0 (Easy), 0.5 (Medium), 1 (Hard). The effective challenge score per quadrant is the average of all cell-direction ratings in that quadrant.

**Flags:**
- Any quadrant where **hard > 40%** — may be frustrating for casual solvers
- Overall hard% > 25% — puzzle may be inaccessibly difficult for the Growlerz audience
- **Significant imbalance across quadrants** — if one quadrant's challenge score is more than 20 points higher than another, the grid feels uneven
- **Flag any quadrant whose challenge score is more than 1 SD from the target rate:**
  - baseline p = **0.20** (fixed target; may be revised as season data accumulates)
  - n = cell-direction pairs in the quadrant
  - SD = sqrt(0.20 × 0.80 / n) ≈ sqrt(0.160 / n)
  - flag if |quadrant rate − 0.20| > SD
- Note: the constructor prefers puzzles on the **easy side**. Do NOT flag low overall difficulty or 0-hard quadrants as issues.

#### DB update

After rating, update `puzzle_clues.db` with difficulty values for this puzzle's entries:
```js
db.prepare('UPDATE clues SET difficulty = ? WHERE id = ?').run(difficulty, clueId);
```
Only update clues that are linked to this puzzle via `puzzle_entries` and currently have `difficulty = NULL`.

#### Output

Report as a table (quadrant → easy / medium / hard counts and %) plus a **hard clue spotlight** table listing all hard clues with their type (Wordplay / Knowledge / Archaic). Note any flags.

### 10. Wordplay distribution

A well-constructed puzzle distributes clever clues throughout the grid so that every section rewards and challenges solvers equally. A section full of flat definitions is boring; a section full of misdirection with no relief is exhausting.

#### Classify every clue

For each clue, assign one of three types:

- **Wordplay** — the clue involves a trick, pun, misdirection, double meaning, or lateral thinking. Signals:
  - Clue ends with `?` (crossword convention for non-literal)
  - Punny phrasing or deliberate double meaning
  - The answer is a different part of speech than the clue implies
  - "Sounds like", "so to speak", "in a way", "perhaps" hedges that signal indirection
  - Self-referential clues ("Word that might refer to...")
  - Cross-reference clues that are themselves playful

- **Straight** — direct synonym, definition, fill-in-the-blank, or factual clue with no misdirection. This includes:
  - Proper noun clues: "Actor Epps" for OMAR, "Actress Hinds of '9-1-1'" for AISHA — knowledge difficulty belongs in DIFF, not PLAY
  - Fill-in-the-blank: "Venus de ___" for MILO — the blank signals the answer type directly
  - Register indicators: "Full-figured, in internet slang" for THICC — the label removes misdirection
  - Foreign-word clues: "Señoritas, affectionately" for CHICAS — direct definition in another language
  - Compound-word format: "Word after Capitol or First" for HILL — standard crossword technique, no misdirection
  - Two-step factual inference: "Fenway Park team, for short" for BOS — requires knowledge, not wordplay
  - Colloquial-phrase entries with direct clues: "'Gotcha'" for ISEE — the clue directly defines the phrase

- **Hybrid** — a clue where the wording itself creates mild misdirection or has a double surface reading, but isn't pure wordplay. The misdirection must live in the **clue**, not just in the solver's knowledge gap. Examples:
  - "Race, as an engine" for REV — "race" initially reads as competitive racing before snapping to revving
  - "Famous fiddler of ancient Rome" for NERO — "fiddler" does double duty (literal musician vs. the legendary emperor)
  - "Are you sure it's impossible?" for CANTWE — evokes the conversational context rather than defining the phrase directly
  - **Not Hybrid:** clues that merely require cultural knowledge, use proper nouns, or employ standard crossword formats (fill-in-the-blank, "Word after X", abbreviation indicators)

This classification is judgment-based. Explain each wordplay classification briefly.

#### Assign entries to grid sections

Use **cell-weighted quadrant averaging** — not start-cell assignment. This more accurately represents where solving effort lives in the grid.

**Grid midpoint** (0-indexed): `midRow = Math.floor(height / 2)`, `midCol = Math.floor(width / 2)`. For a 15×15 grid, both are 7.

**Cell quadrant membership:** A cell at (r, c) belongs to every quadrant for which both its row and column conditions hold. Cells on the boundary row or column count for both adjacent quadrants:
- **NW**: r ≤ midRow AND c ≤ midCol
- **NE**: r ≤ midRow AND c ≥ midCol
- **SW**: r ≥ midRow AND c ≤ midCol
- **SE**: r ≥ midRow AND c ≥ midCol

(A cell at r = midRow, c < midCol belongs to both NW and SW. The center cell r = midRow, c = midCol belongs to all four quadrants.)

**Per-quadrant rating calculation:**

```js
const midRow = Math.floor(puz.height / 2);
const midCol = Math.floor(puz.width / 2);

// Build cell → entry map
const cellAcross = {}, cellDown = {};
for (const e of all) {
  for (const cell of e.cells) {
    const key = `${cell.row},${cell.col}`;
    if (e.dir === 'A') cellAcross[key] = e;
    else cellDown[key] = e;
  }
}

// For each quadrant, collect one rating per (cell × direction)
const quadScores = { NW: [], NE: [], SW: [], SE: [] };

for (let r = 0; r < puz.height; r++) {
  for (let c = 0; c < puz.width; c++) {
    if (puz.grid[r][c].black) continue;
    const key = `${r},${c}`;
    const quads = [];
    if (r <= midRow && c <= midCol) quads.push('NW');
    if (r <= midRow && c >= midCol) quads.push('NE');
    if (r >= midRow && c <= midCol) quads.push('SW');
    if (r >= midRow && c >= midCol) quads.push('SE');
    for (const q of quads) {
      const ac = cellAcross[key];
      const dn = cellDown[key];
      if (ac) quadScores[q].push(ratingOf(ac));  // e.g. wordplay score or difficulty score
      if (dn) quadScores[q].push(ratingOf(dn));
    }
  }
}

// Aggregate: for wordplay%, ratingOf returns 1 (W), 0.5 (H), 0 (S)
// For difficulty challenge score, ratingOf returns 0 (E), 0.5 (M), 1 (H)
for (const q of ['NW','NE','SW','SE']) {
  const scores = quadScores[q];
  const pct = scores.length ? scores.reduce((a,b) => a+b, 0) / scores.length : 0;
  console.log(`${q}: ${(pct*100).toFixed(1)}% (${scores.length} cell-direction pairs)`);
}
```

#### Flag imbalances

For each quadrant, calculate the count and percentage of Wordplay vs. Straight clues (Hybrid counts as 0.5 each for the ratio).

Flag if:
- Any quadrant has **0 wordplay clues** — that section will feel flat
- Any quadrant has **>65% wordplay** — that section may feel exhausting or unapproachable
- The gap between the highest and lowest wordplay% quadrants exceeds **40 percentage points** — signals uneven distribution
- **Flag any quadrant whose wordplay score is more than 1 SD from the target rate:**
  - baseline p = **0.25** (fixed target; may be revised as season data accumulates)
  - n = cell-direction pairs in the quadrant
  - SD = sqrt(0.25 × 0.75 / n) ≈ sqrt(0.1875 / n)
  - flag if |quadrant rate − 0.25| > SD

Report as a table (quadrant → wordplay count / total → %) and list the wordplay clues per quadrant so the constructor can see which corners are heavy or light.

### 10. Proofread all clues

Read every clue carefully for:

**Typos and spelling errors** — flag any misspelled words in the clue text itself.

**Grammatical issues** — subject/verb agreement, punctuation, inconsistent tense. Crossword clues follow specific conventions:
- Clue part of speech should match answer part of speech (plural clue → plural answer, verb clue → verb answer)
- Abbreviation indicators: if the answer is an abbreviation or initialism, the clue should signal this (e.g., "Abbr.", "for short", or the clue itself uses an abbreviation)
- Fill-in-the-blank clues: the blank should fit the answer grammatically in the sentence

**Factual errors** — verify specific claims in the clue:
- Dates and years ("2024 Tinashe hit" — is that the right year?)
- Attributions ("Katy Perry hit" — is that the right artist?)
- Descriptions of people, places, events ("British rule in India (1858-1947)" — are those dates right?)
- Counts and statistics ("729 musical performances over 121 episodes" — flag if verifiable and suspicious)
- Geographic facts ("Pennsylvania city on a lake" — is ERIE on a lake?)

**Consistency with the answer** — re-read each clue knowing the answer and confirm the clue is accurate and unambiguous. A clue that is technically correct but could point to a different answer is worth noting.

Be explicit about confidence: distinguish between "this is definitely wrong" and "I'm not certain — worth verifying." For anything fact-checked from training data, note that the constructor should independently verify.

## Output format

**Reporting convention:** Always lead with percentages. Absolute counts may be shown parenthetically but are secondary — what matters is the proportion, not the raw number. This applies to domain breakdowns, diversity summaries, age tiers, difficulty distributions, wordplay ratios, and cross-puzzle comparisons alike.

Present findings in five sections:

### Proper Noun Crossings (Natick check)
List every proper-noun × proper-noun crossing with risk level and explanation.

### Other Proper Nouns
Table of isolated proper nouns with type (person/place/brand/org) and risk assessment.

### Crosswordese / Weak Fill
Table of flagged entries with the specific issue.

### Diversity
Four sub-sections:

**Knowledge Domains** — table of primary domain → count → %, with a flag if any domain exceeds 35%. Followed by: (a) a **domain cluster report** listing any grid sections where same-domain entries cross or cluster; (b) a **multi-domain richness note** listing any entries with significant secondary domains.

**People** — table of every person referenced (name, context, gender, race/ethnicity, real/fictional), followed by summary counts and any flags for imbalance.

**Geographic/Cultural Diversity** — list every cultural touchpoint (entry, clue excerpt, culture/region). Summarize which cultures appear and which are absent. Flag if there are no non-US-mainstream touchpoints, or if the same culture dominates all non-mainstream references.

**Age Accessibility** — table of quadrant → Excl / Y / M / O counts (Y+M and M+O split proportionately), with any flagged entries. Flag any quadrant with no foothold for a generation (no Older-accessible or no Younger-accessible entries), or any overall skew exceeding baseline + 1 SD.

### Difficulty Distribution
Table of quadrant → easy / medium / hard counts and %, with the effective challenge score. Hard clue spotlight listing all hard entries with type (Wordplay / Knowledge / Archaic). Flags for any flat quadrant (0 hard), any overloaded quadrant (hard > 40%), or overall imbalance.

### Wordplay Distribution
Table of quadrant → wordplay count / total → %, with flags for any quadrant that is flat (0 wordplay), exhausting (>65%), or significantly imbalanced vs. the others. List the wordplay clues per quadrant.

### Proofreading
Table of flagged clues with the issue (typo / grammar / factual / consistency) and explanation. Distinguish clearly between confirmed errors and items that need the constructor to verify. If no issues are found, say so explicitly.

### Summary
Bullet list of the top concerns to address before publishing, ordered by priority. Include difficulty flags (flat quadrant, overall skew), diversity flags (domain, people, age accessibility), and proofreading flags here if significant.

## Notes
- Clean up `puz-tmp.json` after the analysis.
- Never suggest replacement fill or clues — flag issues only. The constructor decides how to fix them.
- If the puzzle hasn't been exported to `.ipuz` yet, remind the user to export from CrosswordCompiler before running.
