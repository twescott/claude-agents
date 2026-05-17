# /provision-outlook-mdb

Provision a new Microsoft Dev Box for Outlook Win32 development and automate the enlistment setup. All decision points route through `/gatekeeper`.

## Usage

```
/provision-outlook-mdb [name] [purpose] [tier: basic|premium]
```

- `name` — dev box name (e.g. `timw-win32-feature`). **Required — escalate via gatekeeper if missing.**
- `purpose` — short description for Fleet Registry (e.g. `login-hint fix`). Optional, default: unset.
- `tier` — `basic` (1TB, default) or `premium` (2TB). Default: `basic` per known preferences.

---

## Gatekeeper decision points

| Decision | Risk | Auto or Escalate |
|---|---|---|
| Name not provided | low/blocking | **Escalate** — names are personal |
| Basic vs Premium tier not specified | low/non-blocking | **Auto** → basic |
| Delete an existing box to make room | high/blocking | **Escalate** |
| Provisioning fails | high/blocking | **Escalate** — report error, ask how to proceed |
| Customization task fails | medium | **Escalate** — report which task, offer retry/skip/abort |
| VPN gate (before build) | medium/blocking | Pause + instruct user, wait for "vpn ready" reply |

Use `TO_GATEKEEPER` format (see `/gatekeeper`) when routing any of the above.

---

## Constants

```
OMR_ENDPOINT    = https://72f988bf-86f1-41af-91ab-2d7cd011db47-devcenter-xybbybwujkpwy-dc.westus3.devcenter.azure.com/
PROJECT_BASIC   = OMRBasicDevBox
POOL_BASIC      = OMRBasicDevBox-16vCPU-1024gb
PROJECT_PREMIUM = OMRPremium
POOL_PREMIUM    = OMRPremium-16vCPU-2048gb-westus2
CATALOG         = __INTRINSIC__
TASK_PS         = __INTRINSIC_PowerShell__
```

---

## Phase 1 — Provision (fully automated)

### 1a. Check capacity
```bash
az devcenter dev dev-box list --endpoint "$OMR_ENDPOINT" --output json \
  | grep -c '"projectName":"OMRBasicDevBox"'
# Limit is 4 per project. If at limit → TO_GATEKEEPER (high, destructive)
```

### 1b. Create
```bash
az devcenter dev dev-box create \
  --endpoint "$OMR_ENDPOINT" \
  --project "$PROJECT" \
  --pool "$POOL" \
  --name "$NAME" \
  --output json
```

### 1c. Poll provisioning (every 30s, timeout 20 min)
```bash
az devcenter dev dev-box show \
  --endpoint "$OMR_ENDPOINT" --project "$PROJECT" --name "$NAME" \
  --output json | grep -E "provisioningState|powerState"
# Stop when provisioningState == Succeeded or Failed
# On Failed → TO_GATEKEEPER (high, blocking, category: approval)
```

---

## Phase 2 — Bridge bootstrap (one-time manual step per box)

> ⚠️ Customization tasks CANNOT run Office tools (`ocheck`, `scoper`, `devinstallc2r`, `ohome`).
> These require `C:\office\src\otools\bin\OpenEnlistment.bat` for PATH setup, which is not
> available in the customization task environment. All post-provisioning setup uses the
> MDB bridge instead.

Output this message and wait for confirmation:

```
⏸ MANUAL ACTION REQUIRED

The MDB bridge needs to be started once on the new box before automated setup can proceed.

1. Connect to <name> in the Dev Portal
2. Open File Explorer → OneDrive - Microsoft\DevBoxAgent\
3. Run start-mdb-bridge.bat

Once running, reply: "bridge ready"
```

Do not proceed until the user confirms the bridge is running.

### 2b — Install bridge auto-start (automated, runs after bridge confirmed)

Run via `mdb_exec.js --no-init` to install the bridge into the Startup folder so it
auto-starts on every future reboot:

```bash
node ~/.claude/devbox-agent/mdb_exec.js \
  "cmd /c copy /y \"%USERPROFILE%\\OneDrive - Microsoft\\DevBoxAgent\\start-mdb-bridge.bat\" \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\start-mdb-bridge.bat\"" \
  --no-init --timeout 30
```

> ℹ️ `start-mdb-bridge.bat` self-elevates via UAC on launch. The user will see a UAC
> prompt on each logon — they must click **Yes** (or log in) to allow elevation.
> This is required because `ocheck` and `ohome` need an elevated shell.

On failure → `TO_GATEKEEPER` (medium, non-blocking) — setup can continue but auto-start won't work.

---

## Phase 3 — Enlistment setup via bridge

Run each command via `mdb_exec.js` (with default `initEnv=true`, which calls
`OpenEnlistment.bat` to initialize the OMR environment before the command).

```bash
NODE=~/.agency/nodejs/node-v22.21.0-win-x64/node.exe  # fallback: node
EXEC="$NODE ~/.claude/devbox-agent/mdb_exec.js"
```

### 3a — ocheck
```bash
$EXEC "ocheck -a -f" --timeout 300
```
`ocheck` may report problems and fix them automatically. If it exits non-zero or asks
for a reboot → `TO_GATEKEEPER` (medium, blocking):
```
options: A) Reboot box and re-run ocheck  B) Skip ocheck and continue  C) Abort
```
After a reboot, wait for the bridge to come back (it auto-starts via Startup folder),
then re-run ocheck until it exits cleanly.

### 3b — Scoper setup
```bash
$EXEC "scoper add mso* license* floodgate* msocommandline msoflex msotcids otools identity*; scoper reflow" --timeout 300
```

On failure → `TO_GATEKEEPER` (medium, blocking).

---

## Phase 4 — VPN gate (manual, required before build)

Output this message and wait:

```
⏸ MANUAL ACTION REQUIRED

Connect MSFTVPN before the first build.
VPN is required for Office share access during ohome.

Once connected, reply: "vpn ready"
```

Do not proceed to Phase 5 until the user confirms.

---

## Phase 5 — First build via bridge

```bash
$EXEC "ohome x64 debug" --timeout 10800
```

Warn: "First build typically takes 1–2 hours. I'll monitor progress and notify you when complete."

Monitor `~/OneDrive - Microsoft/DevBoxAgent/mdb-resp/prog_<id>.json` every 2 min for progress.

> ⚠️ If `ohome` prompts "Pending reboot detected, continue anyway? [y/n]" — the box needs
> a reboot first. Route to gatekeeper:
> ```
> options: A) Reboot now and restart ohome after  B) Connect and answer manually
> ```

On completion, run:
```bash
$EXEC "devinstallc2r install" --timeout 600
```

Then output:
```
✅ First build complete. To launch Outlook Win32 with VS attached:

    r c2r devenv outlook
```

---

## Fleet Registry update
After Phase 1 completes, add to Fleet Registry:
`<name> | OMRBasicDevBox | <pool> | Running | 16c/64GB/<disk>GB | <purpose> | <timestamp>`

## Ops Log
Append each phase transition and gatekeeper decision:
`timestamp | action | devbox | result | notes`

## References
- OWiki: https://www.owiki.ms/wiki/Outlook/Desktop/Creating_a_virtual_Microsoft_Dev_Box
- ADO Wiki: https://office.visualstudio.com/CLE/_wiki/wikis/ProSAT%20Signals%20and%20Insights%20Team%20Wiki/118585
