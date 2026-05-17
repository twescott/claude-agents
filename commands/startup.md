# Startup Checklist

Run this at the start of any session to orient yourself. **Read this file in full before doing anything else.**

## Where preferences live

**Skill files are durable. Memory is not.**

When the user specifies a preference, rule, or working convention:
- Save it to the **relevant skill file** (`xword-db.md`, `quote-contrary.md`, `upload-puzzle.md`, `analyze-puzzle.md`, etc.)
- If no relevant skill exists, add the rule to this file (`startup.md`)
- Do **NOT** save preferences to memory — the user has explicitly said memory is ephemeral and unreliable

If you notice yourself writing a rule or preference to a memory file, stop and redirect it to the appropriate skill file.

---

## Data Restrictions — STRICTLY ENFORCED

- **Do NOT** access, read, or use any Microsoft data sources, including:
  - Outlook mailboxes, calendars, or contacts
  - Microsoft Teams messages or channels
  - Exchange or Exchange Online data
  - Azure resources or subscriptions
  - Corporate OneDrive, SharePoint, or other work/enterprise file storage
  - Active Directory or Entra ID (Azure AD) data
  - Any dev box provisioning systems or MDB manager contexts
  - Any corporate or enterprise Microsoft tenant data

- **Personal OneDrive is permitted** for reading personal project files (e.g. word lists, puzzle data).
- **Do NOT** call any Microsoft Graph API endpoints for work/corporate resources.
- **Do NOT** reference or import data from the work/dev box environment.
- **Do NOT** connect to any Microsoft-managed infrastructure.

## Purpose

This space is for personal AI projects only. Use public APIs, local files, and personal (non-Microsoft) services only.

## Following Instructions

- **Follow all skill files and commands TO THE LETTER.** Skill files are the authoritative specification for how to perform a task. Do not substitute your own judgment for what they say.
- **Always read the full skill file before performing the action** — never rely on what may be in context. Skill files may be truncated in context summaries.
- **Do not add, omit, or reinterpret steps.** If a skill says to do X, do X — even if you think Y is better.
- **When you make an error that contradicts a skill or instruction, immediately update the relevant skill file** to prevent recurrence — do not wait to be asked.
- **Never ask for permission to do something the user has already instructed you to do.** Just do it.
- **Only ask clarifying questions when instructions are genuinely ambiguous or incomplete.** Do not ask about things that are already specified.
- **Always ask before killing processes.** Never stop, terminate, or kill a running process without explicit user confirmation first. This includes background scripts, taggers, servers, and any async work.

## MANDATORY PRE-ACTION CHECK — NO EXCEPTIONS

Before EVERY tool call that modifies state (writing files, running commands, changing DB, stopping/starting processes, editing control files), you MUST write in your response the exact user quote that authorized this specific action. If you cannot find a direct quote from the user in this conversation that authorizes the action, you MUST use ask_user instead. No exceptions. No paraphrasing. Literal quote or ask.

Example:
- User said: "yes" (in response to "Apply this?") → authorized to apply the change discussed
- User said: "Go ahead" → authorized to proceed with the specific thing just proposed
- User said nothing about stopping → YOU MUST ASK

This is a forcing function. The act of searching for the quote makes you stop and notice when authorization doesn't exist.

## LLM API Access — NO SDK, USE CLAUDE CLI

- The user does **NOT** have an Anthropic API key. **NEVER suggest switching to `@anthropic-ai/sdk`.**
- All LLM scripts use `claude.cmd` (the Claude Code CLI) for API calls. This is by design.
- When `claude.cmd` auth expires, re-authenticate with: `claude auth login --sso --email tiwescot@microsoft.com`
- The auth is via **Microsoft SSO** under "Experiences+Devices, Microsoft Corporation" org. Do NOT use `--console` or the default login flow.
- **STOP suggesting the SDK.** This has been discussed 10+ times. The answer is always no.

## Script Execution — NEVER WITHOUT EXPLICIT PERMISSION

- **NEVER run a script, tagger, or long-running process unless the user explicitly tells you to.** "Fix this" does NOT mean "run the script." Ask what the user wants you to do.
- **NEVER run a script that writes to a file that already contains valuable data** without first backing up that file AND confirming with the user. Date-stamped output files (flags, progress, votes) accumulate hours of compute — treat them as irreplaceable.
- **Before running ANY script, state what you plan to run and wait for confirmation.** No exceptions — even if the user is frustrated and wants speed.
- **"FIX THIS" means propose a fix and wait.** It does not mean execute immediately.
- **You MUST read and follow `llm_skills/run-script.md` before every script execution.** This is a mandatory checklist — complete all steps or do not execute.
- **Always use `--verbose` when running scripts.** Never omit verbose/debug output. If a script supports `--verbose`, `--debug`, or similar flags, always include them.
- **All long-running scripts MUST write progress to a log file** (not just stdout). Include: subjects/items processed, total count, flags/errors generated, timestamp. The log file must be readable from outside the process at any time so progress can be checked without relying on the shell buffer. Name it `<script-name>-progress.log` in the same directory.
- **"Most complex first" means subjects with the most entities, not entities with the longest qualifier strings.** When processing subjects, always order by entity count descending (most entities per subject first) unless the user specifies otherwise. Do not substitute a different interpretation of "complexity."

## File I/O Best Practices for Concurrent Scripts

High-concurrency scripts (many workers) can crash Windows via excessive FS I/O. Follow these rules:

- **Never rewrite large files.** If a results file grows over time, use **append-only JSONL** (one JSON object per line). Never serialize and rewrite an entire multi-MB JSON array on every save.
- **Debounce checkpoint/metadata writes.** Files like completed-keys or status should flush at most every **30 seconds**, not on every item completion. Use a dirty flag + interval timer.
- **Atomic writes for shared state files.** Write to a `.tmp` file, then `fs.renameSync()` over the target. This prevents readers from seeing a partial/truncated file after a crash.
- **Use streaming writes.** Open a `WriteStream` in append mode (`{ flags: 'a' }`) once and reuse the fd. Do not repeatedly open/close files.
- **Single writer pattern.** All file I/O should go through a single async writer loop — workers push to a queue, the writer drains it. Never have multiple workers calling `writeFileSync` concurrently.
- **Startup migration.** When switching from full-rewrite JSON to JSONL, auto-migrate the old file on first run and rename it to `.bak`.
- **JSONL dedup on load.** Since JSONL is append-only, duplicates can accumulate (e.g., requeue updates). On load, dedup by key, keeping the last entry.

## Entity Merge Rules

- **Only merge true synonyms** — entities at the same level of specificity that mean the same thing.
- **Never merge entities that form a specificity chain.** If A is more general than B, they are separate entities at different tiers, not duplicates. The tier system exists to preserve this hierarchy.
- **Qualifiers within an entity should be at the same specificity level.** E.g., "motion, movement" (synonyms) is correct. "motion, travel, departure" (hierarchy) is wrong — those are 3 separate entities.
- **Test proposed merges:** ask "is X more general than Y?" If yes, they are separate tiers, not merge candidates.
- **Same-concept test (bidirectional):** To decide if two same-tier qualifiers A and B describe the same entity, ask both: "Is there a [subject] that is [A] but NOT [B]?" and "Is there a [subject] that is [B] but NOT [A]?" If either direction has a real counterexample, they are DIFFERENT entities. If neither does, they are the SAME and should be merged.

## Concurrent LLM Script Design Rules

When building scripts that make parallel LLM API calls:
- **Stagger worker startup** — add a delay between launching workers to avoid a thundering herd at startup (e.g., spread launches over 30s). Never launch all workers simultaneously.
- **Retry with exponential backoff** — after a timeout or error, wait before retrying (e.g., 5s → 15s → 45s). Never retry immediately (1s or less).
- **Requeue failed items** — after all workers complete, run a second pass to retry any items that returned no result (null/NO_WINNER). These often failed due to transient congestion, not inherent problems.

## Flag Files — NEVER DELETE, ALWAYS TRACK

- **NEVER delete, strip, or remove flags from a flag file.** Flags are permanent records. Mark them as reviewed instead.
- **NEVER modify a flag file without showing the user exactly what will change and getting explicit approval.**
- **All flag files use `reviewed` tracking.** Each flag object has `reviewed` (bool), `reviewed_at` (ISO timestamp), and `decision` (string). Use `markFlagsReviewed()` in qualifier-reassign.js or equivalent logic.
- **When reviewing flags, mark them reviewed immediately** — do not defer tracking to later.
- **To see unreviewed flags:** filter for `reviewed === false`. Never assume flags are reviewed based on session history alone — check the `reviewed` field.
- **If a flag file lacks `reviewed` fields, add them** (set to `false`) before doing anything else with the file.

## "Show me the PDF"

When the user asks to "show me the pdf" (or any variant), open the file in the system default viewer using:

```
start "" "<path-to-file.pdf>"
```

Do NOT use the Read tool to display PDF contents inline. The user wants the file opened on their desktop.

## Output completeness

When running scripts or tools that produce reports (meta-analysis, puzzle analysis, DB queries, etc.), **output the full result verbatim** in the response. Do not summarize, condense, or paraphrase the output. The user wants to read the actual report, not a digest of it.

**Show ALL data — never filter or editorialize.** When displaying hierarchies, trees, query results, or any structured data, include every item — even singletons, orphans, or items with no edges. Do not omit entries because they seem uninteresting. Do not add commentary about what the user "needs to see." Present the complete data and let the user draw their own conclusions.

## Reviewing flagged edge pairs — MANDATORY WORKFLOW

When reviewing flagged pairs from build-edges-results.jsonl, follow this EXACT sequence for EVERY pair. No exceptions. No shortcuts.

### Step 1: Show raw data
- Full vote reasoning for Q1 AND Q2 (every voter's answer + counterexample)
- Validation results if present
- Nothing else. No commentary. No "this suggests..." No "seems like..."

### Step 2: Wait
- Say nothing. Let the user decide.

### Step 3: After user gives verdict
- Apply the override (or confirm) IMMEDIATELY
- Mark as reviewed IMMEDIATELY (`reviewed: true`, `reviewed_at`, `decision`)
- Append updated group to JSONL IMMEDIATELY
- Do NOT defer, batch, or "come back to it later"

### Rules
- **NEVER speculate** about what the answer "should" be. Not from intuition, not from other pairs, not from literal/metaphorical parallels, not from tiers.
- **NEVER editorialize** before showing data. The counterexamples ARE the analysis.
- **NEVER ask "should I mark this reviewed?"** — YES, ALWAYS, IMMEDIATELY.
- **NEVER show a pair without showing its full vote reasoning.** If you catch yourself summarizing votes as "3Y/2N" without the actual text, STOP and show the text.
- **The user ran expensive LLM scripts to generate this data. SHOW IT. That's the job.**

**Tool output is NOT visible to the user.** The user cannot see raw tool/command output — they can only see your text response. After every script run, query, or tool call that produces results, you MUST write out the full results in your response text. Do NOT rely on tool output being visible. Do NOT say "see above" or assume the user can read powershell/node output. ALWAYS transcribe results into your response.

## When the user reports something is wrong

**Believe the user.** If the user says something is broken or incorrect, investigate immediately — do not dismiss or explain away the report with theories (CDN cache, browser cache, etc.) before verifying the actual live content yourself. The user is looking at the real thing; trust that observation.

## Saving Preferences and Rules

When the user specifies a preference, behavioral rule, or working convention:

- **Save it to the relevant skill file** (e.g. `xword-db.md`, `quote-contrary.md`, `upload-puzzle.md`), NOT to memory
- Memory (MEMORY.md and memory/*.md files) is ephemeral and unreliable — the user has explicitly said not to rely on it for preferences
- If no relevant skill file exists, add the rule to this file (`startup.md`)
- If you catch yourself writing a preference to memory, stop and write it to the skill file instead
