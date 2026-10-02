# Mobile MCP Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the `mobile-mcp` server for this repo, register it in the current VS Code environment, and verify it can reach a live Android emulator so the Meal Rescue app can be opened and inspected.

**Architecture:** The repo will keep a workspace-level MCP configuration in `.vscode/mcp.json` while the current VS Code installation receives the same server registration via `code --add-mcp`. After configuration, the workflow validates the Android toolchain (`adb`/emulator) and attempts to launch the app on a running emulator.

**Tech Stack:** VS Code MCP configuration, `npx`, `mobile-mcp`, Android SDK (`adb`, emulator), Expo/React Native app (`apps/mobile`).

## Global Constraints

- Use a repo-local workspace MCP config instead of a runtime dependency in `apps/mobile`.
- Keep `.vscode/` ignored except for the committed `.vscode/mcp.json` file.
- `mobile-mcp` requires Android Studio/platform tools and an Android emulator or USB-debugging device.
- No app code changes are required unless the emulator workflow exposes a repo issue.

---

### Task 1: Configure repo-local MCP settings

**Files:**
- Create: `C:/Users/LOUJAN B/Meal Rescue.worktrees/install-mobile-mcp/.vscode/mcp.json`
- Modify: `C:/Users/LOUJAN B/Meal Rescue.worktrees/install-mobile-mcp/.gitignore`

**Interfaces:**
- Consumes: repo root, current `.gitignore` rules
- Produces: a reproducible workspace MCP definition for the `mobile` server

- [ ] **Step 1: Add repo-local MCP config**

```json
{
  "servers": {
    "mobile": {
      "command": "npx",
      "args": ["-y", "mobile-mcp"]
    }
  }
}
```

- [ ] **Step 2: Unignore only the MCP config**

```gitignore
!.vscode/
.vscode/*
!.vscode/mcp.json
```

- [ ] **Step 3: Verify config JSON parses**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('.vscode/mcp.json','utf8')); console.log('mcp ok')"
```

Expected: prints `mcp ok`

### Task 2: Register MCP server in current VS Code installation

**Files:**
- None; config is applied via VS Code CLI

**Interfaces:**
- Consumes: `code` command availability and repo-local config
- Produces: active VS Code user-level MCP registration

- [ ] **Step 1: Register the server**

Run:

```bash
code --add-mcp '{"name":"mobile","command":"npx","args":["-y","mobile-mcp"]}'
```

- [ ] **Step 2: Validate registration**

Run:

```bash
code --list-mcp
```

Expected: includes `mobile` with `npx -y mobile-mcp`

### Task 3: Validate Android/device prerequisites

**Files:**
- None; runtime environment validation only

**Interfaces:**
- Consumes: Android SDK tools in local environment
- Produces: readiness for running the app on an emulator

- [ ] **Step 1: Check installed SDK tools**

Run:

```bash
adb devices
```

If no Android device is present, run:

```bash
$env:ANDROID_HOME\emulator\emulator.exe -list-avds
```

Expected: a device or emulator is listed, or a clear missing-tool error shows what is absent.

- [ ] **Step 2: Start or confirm emulator**

If an emulator exists:

```bash
$env:ANDROID_HOME\emulator\emulator.exe -avd <AVD_NAME>
```

Then re-run:

```bash
adb devices
```

Expected: emulator shows as `device` or `offline` before app launch.

### Task 4: Launch the Meal Rescue app on the emulator

**Files:**
- None; app launch depends on Android device state

**Interfaces:**
- Consumes: emulator/device readiness and Expo app package metadata
- Produces: app opened for inspection with mobile MCP or adb-backed tooling

- [ ] **Step 1: Install or run the app**

Use the existing Expo project in `apps/mobile` with the project’s Android app entrypoint:

```bash
npm install --workspace @meal-rescue/mobile
npm run android --workspace @meal-rescue/mobile
```

If Gradle or Expo is already configured and the mobile app is available, this command should start it on the selected emulator.

- [ ] **Step 2: Check the install target**

Run:

```bash
adb shell pm list packages | findstr /I mealrescue
```

Expected: app package appears if installed.

- [ ] **Step 3: Open the app**

Run:

```bash
adb shell am start -n com.mealrescue.app/.MainActivity
```

If the package and activity are different, first inspect the manifest or use `adb shell dumpsys package <pkg>` to resolve the true launcher activity.

### Task 5: Validate the mobile control path

**Files:**
- None; validation only

**Interfaces:**
- Consumes: emulator and MCP installation readiness
- Produces: confirmation that the app can be inspected or interacted with through the configured toolchain

- [ ] **Step 1: Confirm live screen capability**

If the `mobile-mcp` server is functioning, it should now be able to inspect the emulator and interact with the app UI. Use the server command to enumerate available tools or trigger a UI dump.

- [ ] **Step 2: Record blockers**

If Android Studio, emulator, or app packaging is unavailable in this environment, note the blocker and the exact remediation step required.

### Task 6: Commit configuration changes

**Files:**
- `C:/Users/LOUJAN B/Meal Rescue.worktrees/install-mobile-mcp/.vscode/mcp.json`
- `C:/Users/LOUJAN B/Meal Rescue.worktrees/install-mobile-mcp/.gitignore`

- [ ] **Step 1: Review diff**

```bash
git --no-pager diff -- .gitignore .vscode/mcp.json
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore .vscode/mcp.json
git commit -m "chore: configure mobile-mcp"
```
