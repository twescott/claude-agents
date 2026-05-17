# /setup-teams-bridge

Sets up and manages the DevBox Manager Teams bridge.
After setup, you can control dev boxes from any Teams client including mobile.

---

## Architecture (OneDrive File Relay)

```
[Teams mobile]
      ↓  PA Flow 1: "When new message in chat"
      ↓  → Create cmd_<id>.json in OneDrive/DevBoxAgent/commands/
[OneDrive sync client]  ← already running, transparent relay
      ↓  file appears at local path within ~2-5s
[teams_bridge.js]  fs.watch() — instant detection
      ↓  process command → az CLI
      ↓  write resp_<id>.json to OneDrive/DevBoxAgent/responses/
[OneDrive sync client]
      ↓  file appears in SharePoint
[PA Flow 2]  "When file created in /responses/"
      ↓  parse response → post HTML to Teams chat → delete file
[Teams mobile]
```

**Zero external dependencies. Zero auth setup. Zero Azure resources.**
The bridge is pure filesystem I/O. OneDrive sync handles everything else.

---

## File locations

| Path | Purpose |
|---|---|
| `OneDrive - Microsoft/DevBoxAgent/commands/` | PA drops command files here |
| `OneDrive - Microsoft/DevBoxAgent/responses/` | Bridge writes response files here |
| `PersonalAI/devbox-agent/teams_bridge.js` | Main bridge script |
| `PersonalAI/devbox-agent/start-agent.bat` | Launcher — double-click to run |
| `PersonalAI/devbox-agent/bridge.log` | Rolling log |
| `PersonalAI/devbox-agent/pa-flow-1-teams-to-onedrive.json` | PA Flow 1 reference |
| `PersonalAI/devbox-agent/pa-flow-2-onedrive-to-teams.json` | PA Flow 2 reference |

---

## One-time setup

### Step 1 — Create the Teams chat
In Teams (desktop or mobile):
- Click **New chat** → give it a name: **DevBox Manager Agent** → start the chat

### Step 2 — Create Power Automate Flow 1 (Teams → OneDrive)
Go to **make.powerautomate.com** → **Create** → **Automated cloud flow**

**Trigger:** `Microsoft Teams` → *When a new message is added to a chat*
- Chat: select "DevBox Manager Agent"

**Action:** `OneDrive for Business` → *Create file*
- Folder path: `/DevBoxAgent/commands`
- File name: `cmd_@{triggerBody()?['id']}.json`
- File content:
  ```
  @{string(createObject(
    'id',   triggerBody()?['id'],
    'text', triggerBody()?['body']?['content'],
    'ts',   utcNow()
  ))}
  ```

**Add condition** (to skip the agent's own replies):
- Filter: `triggerBody()?['from']?['user']?['id']` **is not equal to** your user ID
  (`19301e85-e40b-4a0b-9dcc-c1d1fc0941dd`)
- Put the "Create file" action inside the Yes branch only

Save as: **DevBox - Teams to OneDrive**

### Step 3 — Create Power Automate Flow 2 (OneDrive → Teams)
**Trigger:** `OneDrive for Business` → *When a file is created*
- Folder: `/DevBoxAgent/responses`

**Action 1:** `Data Operations` → *Parse JSON*
- Content: `@triggerBody()`
- Schema: `{ "type": "object", "properties": { "id": {"type":"string"}, "html": {"type":"string"} } }`

**Action 2:** `Microsoft Teams` → *Post message in a chat or channel*
- Post in: Chat
- Chat: "DevBox Manager Agent"
- Message: `@body('Parse_JSON')?['html']`
- (Set message format to HTML if option is available)

**Action 3:** `OneDrive for Business` → *Delete file*
- File: `@triggerOutputs()?['headers']?['x-ms-file-id']`

Save as: **DevBox - OneDrive to Teams**

### Step 4 — Start the agent
Double-click `start-agent.bat`. Leave the window open.
The agent starts watching immediately — no auth prompt, no setup.

### Step 5 — Autostart (optional)
Press **Win+R** → `shell:startup` → copy `start-agent.bat` shortcut into the folder.

---

## Supported commands

| Command | Action |
|---|---|
| `status` | Full fleet table with power state |
| `start <name>` | Start a dev box |
| `stop <name>` | Stop (deallocate) a dev box |
| `restart <name>` | Restart a dev box |
| `help` | Command reference |

---

## End-to-end latency

| Leg | Latency |
|---|---|
| Teams → PA trigger | ~1 min (PA polling interval) |
| PA → OneDrive file write | ~2s |
| OneDrive sync → local file | ~2-5s |
| Bridge processes + writes response | <1s (az CLI) |
| OneDrive sync → SharePoint | ~2-5s |
| PA trigger → Teams reply | ~1 min |
| **Total round trip** | **~2-3 minutes** |

To reduce latency, set PA flow trigger recurrence to 1 minute (minimum for standard connectors).
Premium Power Automate licence allows instant triggers on Teams messages.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No response to commands | Check bridge.log; verify OneDrive sync is running (taskbar icon) |
| `cmd_*.json` files pile up | Bridge not running — start `start-agent.bat` |
| `resp_*.json` files pile up | Flow 2 not running — check make.powerautomate.com |
| az CLI errors in responses | Run `az login` in a terminal to refresh Azure credentials |
| HTML showing as raw text in Teams | In Flow 2, ensure message format is set to HTML |

---

## Adding new commands

1. Add a handler function in `teams_bridge.js` (e.g. `handleProvision`)
2. Add a case to the `dispatch()` function
3. Restart `start-agent.bat`
No changes to Power Automate flows needed.
