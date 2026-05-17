# Clue Tagger

Tags clues in `puzzle_clues.db` with subjects, wordplay classification, diversity categories, domains, relationships, and edge cases.

## Script

- **Path:** `C:/Users/tiwescot/PersonalAI/clue-tagger.js`
- **Audit script:** `C:/Users/tiwescot/PersonalAI/audit-tagger.js` (re-runs 100 random already-tagged clues and reports discrepancies)

## Prerequisites

- **Node.js** with `better-sqlite3` installed (`npm install` in repo root)
- **Claude CLI** (`claude`) installed and authenticated:
  - Run `claude auth login` on a new device — it opens a browser OAuth flow
  - Sign in with your Microsoft account (tiwescot@microsoft.com) in the browser first
  - Auth is under the "Experiences + Devices, Microsoft Corporation" org
- No API key needed; the script spawns `claude` as a child process and relies on the CLI's existing auth session

## Usage

```
node clue-tagger.js                   # run all untagged
node clue-tagger.js --limit=100       # process N random words
node clue-tagger.js --word=OBAMA      # process one word
node clue-tagger.js --words=A,B,C     # comma-separated words
node clue-tagger.js --puzzle-words    # only words linked to published puzzles
node clue-tagger.js --dry-run         # print prompts, no API calls or DB writes
node clue-tagger.js --verbose         # show raw API responses
```

## How it works

1. **Query untagged clues** — selects words where `wordplay_type IS NULL` from `clues` table
2. **Batch** — groups clues into batches of ≤25 clues each
3. **LLM classification** — sends each batch to Claude Haiku via the `claude` CLI (already authenticated via Claude Code — no API key needed) with a detailed system prompt that specifies:
   - Subject identification (named entities, concepts, works)
   - Subject fields: name (with required parenthetical qualifier), type, fictional, age_tier, proper_noun_type, domains, diversity categories, relationships, edge_cases
   - Wordplay type: Straight / Wordplay / Hybrid
   - Detailed domain and diversity tagging rules
4. **Multi-run voting** — runs each batch 2+ times and uses convergence logic:
   - Runs 1 & 2: if results match exactly → fast-path accept
   - If disagreement: adaptive rounds until all binary dimensions converge (≥3 votes for one option) or MAX_RUNS (20) hit
   - First-to-3 voting for set membership (domains, categories)
   - Flags close decisions (3-2 splits) for human review
5. **DB write** — in a transaction: updates `wordplay_type` on clues, upserts subjects/domains/categories/relationships/edge_cases, links clues to subjects

## DB tables written

- `clues.wordplay_type` — updated with Straight/Wordplay/Hybrid
- `subjects` — (name, subject_type, fictional, age_tier, proper_noun_type)
- `subject_domains` — (subject_id, domain)
- `subject_categories` — (subject_id, category_id, notes)
- `clue_subjects` — (clue_id, subject_id)
- `subject_relationships` — (subject_id, related_id, relationship)
- `subject_edge_cases` — (subject_id, category, reason, source_word)

## Output files

After each run, writes:
- `tagger-flags-YYYY-MM-DD.json` — dimensions with close votes needing human review
- `tagger-votes-YYYY-MM-DD.json` — complete vote record for every clue processed

**CRITICAL:** The flags file is overwritten on each run (same date = same file). The tagger now auto-backs up any existing flags file before overwriting, but **never run the tagger casually on the same day as a long run** without first backing up the flags file manually. Flag data represents hours of compute time and cannot be regenerated without re-running.

## Valid values

- **Domains:** Music, Film, Television, Theater, Sports & Games, History & Politics, Science & Tech, Literature, Visual Art, Geography, Food & Drink, Everyday Life
- **Age tiers:** Y, M, O, NG, Y+M, M+O, Y+M+O
- **Wordplay types:** Straight, Wordplay, Hybrid
- **Proper noun types:** person, place, brand, org, null
- **Subject types:** person, place, org, work, concept
- **Relationships:** voiced_by, played_by, created_by, performed_by, member_of, has_member, associated_with

## LLM configuration

The script uses the **`claude` CLI** (already authenticated via Claude Code) to call Claude Haiku. No API key is needed — authentication is handled by the CLI's existing login session.

## Flag review rules

- **Recommendations are suggestions only.** When the user gives an explicit decision on flags (accept/reject), follow it exactly — do not substitute your own judgment.
- "The rest are fine" means accept all remaining flags not specifically called out.
- When processing accepted flags, insert every accepted subject into the DB. Do not skip any based on your own assessment.

## Post-run protocol

After every clue-tagger run, **always** do both of the following before anything else:

1. **Show full DB results** — query and display all clues (word, clue, wordplay_type), all subjects per clue, and all subjects with their domains/categories/age_tier/proper_noun_type/fictional. No summaries, no paraphrasing.
2. **Show all flags and ask the user to resolve them.** If no flags, say so explicitly.

## Key rules from system prompt

- Every subject name MUST have a parenthetical qualifier (e.g. "Barack Obama (politician)")
- **Qualifiers must be specific enough to uniquely identify the entity.** Generic qualifiers like "person", "thing", "action", "activity", "place", "concept", "object", "item", "state", "quality", "group", etc. are rejected by the parser. Use specific types: "emotion", "body part", "cooking technique", "musical term", etc.
  - Multiple equivalent qualifiers on the same entity are fine (e.g. "president" and "politician" both refer to the same Barack Obama) — keep those.
  - Bad: a qualifier so vague it could refer to multiple different entities with the same base name.
- **People subjects must use the person's full name**, not just a first name (e.g. "Bret Easton Ellis (author)" not "Bret (person)"). Reject flagged people subjects that only have a first or partial name.
- **Do NOT consolidate or deduplicate qualifiers on subject_entities.** Multiple equivalent qualifiers (e.g. ["profession", "occupation"]) are intentional — the more variants stored, the higher the chance of an exact string match when the tagger proposes a qualifier in the future. Only flag an entity if it has NO qualifiers (`[]`).
- Every clue must have at least one subject
- For real people, race/ethnicity MUST be included in categories
- "United States (general)" is NEVER optional for Americans
- Films/TV/books/albums MUST include a created_by/performed_by relationship to their creator
- Any proper name in the clue text MUST be a subject
- Animals → Science & Tech (not Geography)
- Folklore figures → Everyday Life (not History & Politics)
