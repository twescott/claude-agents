# Skill: Run Script

## Purpose

This skill governs ALL execution of scripts, taggers, and any command that writes to files or databases. It MUST be read and followed before every such execution. No exceptions.

## Protocol

### Step 1: Identify the command

State the exact command you intend to run, including all flags and arguments. Example:

> I want to run: `node entity-merge.js --subject=chain --verbose`

### Step 2: Identify what it will modify

List every file or database that will be written to. Example:

> This will modify: `puzzle_clues.db` (merging entities, deleting rows)

### Step 3: Confirm backup exists

If the target is a database, confirm that `db-backup.js` is wired into the script and will auto-backup before writes. If it's a non-DB file that contains valuable data (flags, progress, votes), confirm a copy has been made.

> Backup: automatic via db-backup.js (rotates to backups/ and OneDrive)

### Step 4: Wait for user confirmation

Do NOT execute. Present steps 1-3 to the user and wait for explicit approval. Acceptable confirmations: "go", "run it", "yes", "do it", "proceed", or similar affirmative.

**Silence is NOT consent. Ambiguity is NOT consent. "Test it" is NOT consent — ask what they mean.**

### Step 5: Execute

Only after receiving explicit confirmation, run the command.

## What counts as "running a script"

- Any `node <file>.js` command
- Any `python <file>.py` command
- Any command that invokes a script, build tool, or process that writes data
- Any `powershell` tool call containing executable code that modifies files or databases

## What does NOT require this protocol

- Read-only queries (`node -e "db.prepare('SELECT ...').all()"`)
- File reads (`cat`, `Get-Content`, `view` tool)
- `--dry-run` executions that provably write nothing
- Installing packages (`npm install`, `pip install`)
- Git operations that don't modify working files (`git log`, `git status`, `git diff`)

## Violations

If you catch yourself executing a script without completing steps 1-4, STOP IMMEDIATELY. Inform the user what happened. Do not attempt to fix the damage without going through this protocol again.
