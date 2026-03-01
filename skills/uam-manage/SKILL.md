---
description: UAM plugin management - installation status, update, uninstall, diagnostics
---

# UAM Manage

Plugin lifecycle management with 4 subcommands: status (default), update, uninstall, doctor.

## Argument Parsing

Parse the first argument after the skill invocation:
- No argument or `status` → **Status** subcommand
- `update` → **Update** subcommand
- `uninstall` → **Uninstall** subcommand
- `doctor` → **Doctor** subcommand

---

## Subcommand: status (default)

### Step 1: Detect Installation

Check both installation paths:
```
GLOBAL: ~/.claude/plugins/marketplaces/uam
PROJECT: .claude/plugins/uam
```

For each path:
- Does it exist?
- Is it a symlink? If so, resolve the target with `readlink`
- Is the symlink target valid (directory exists)?

### Step 2: Read Plugin Metadata

Read `plugin.json` from the resolved plugin root:
- `name`, `version`, `description`

### Step 3: Count Components

Count files in each directory:
- `agents/*.md` → agent count
- `skills/*/SKILL.md` → skill count
- `hooks/hooks.json` → hook event count (parse JSON keys under `hooks`)
- `commands/*.md` → command count

### Step 4: Check Active Pipeline

Read `.uam/state.json` if it exists:
- `current_phase`, `pipeline_id`, `started_at`
- If no state → "No active pipeline"

### Step 5: Output Report

```
UAM Plugin Status
━━━━━━━━━━━━━━━━
Installation:
  Global: {✓ installed | ✗ not installed} {path → target}
  Project: {✓ installed | ✗ not installed} {path → target}

Version: {version}

Components:
  Agents: {N}    Skills: {N}
  Hooks:  {N}    Commands: {N}

Active Pipeline: {pipeline_id or "none"}
  Phase: {current_phase}
  Started: {started_at}
```

---

## Subcommand: update

### Step 1: Resolve Plugin Root

Find the symlink target to get the actual UAM source directory.
If not a symlink (copied install), warn and stop:
"UAM was installed by copy, not symlink. Re-run install.sh for symlink-based updates."

### Step 2: Check Git Status

Run in the resolved source directory:
```bash
git -C {uam_source_dir} fetch origin
git -C {uam_source_dir} log HEAD..origin/main --oneline
```

- If no new commits → "Already up to date." and stop
- If new commits exist → show the commit list

### Step 3: Pull Updates

```bash
git -C {uam_source_dir} pull --ff-only origin main
```

- If fast-forward succeeds → "Updated successfully"
- If fast-forward fails (diverged) → warn user: "Local changes detected. Please merge manually."

### Step 4: Verify Post-Update

- Re-count components (agents, skills, hooks)
- Compare with pre-update counts
- Report changes: "Added 2 agents, 1 skill. Removed 0."

### Step 5: Output Report

```
UAM Update
━━━━━━━━━━
Previous: {old_commit_short}
Current:  {new_commit_short}

Changes:
  {commit list}

Components:
  Agents: {old} → {new}
  Skills: {old} → {new}

Symlink install — no re-installation needed.
Restart Claude Code to activate changes.
```

---

## Subcommand: uninstall

### Step 1: Detect Installation Scope

Check both global and project symlinks (same as status Step 1).

### Step 2: Check Active Pipeline

Read `.uam/state.json`:
- If active pipeline exists (current_phase not in ["completed", "cancelled", null]):
  - Warn: "Active pipeline detected ({pipeline_id}, phase: {current_phase})"
  - Ask user via AskUserQuestion:
    - "Cancel pipeline and uninstall" → proceed
    - "Keep pipeline state, uninstall plugin only" → proceed without state cleanup
    - "Abort uninstall" → stop

### Step 3: Ask State Cleanup Preference

Use AskUserQuestion:
- "Also delete .uam/ state directory?"
  - "Yes — clean uninstall (remove all state)" → will run `uninstall.sh --clean`
  - "No — keep state for possible re-install" → will run `uninstall.sh`

### Step 4: Execute Uninstall

Run the appropriate uninstall command:
```bash
bash {uam_source_dir}/uninstall.sh        # without state cleanup
bash {uam_source_dir}/uninstall.sh --clean # with state cleanup
```

### Step 5: Verify and Report

```
UAM Uninstalled
━━━━━━━━━━━━━━━
Removed:
  {✓ Global symlink removed | ✗ was not installed}
  {✓ Project symlink removed | ✗ was not installed}
  {✓ .uam/ state removed | ⏭ state preserved}

Knowledge preserved:
  docs/learnings/ — always kept (never deleted)

To re-install: ./install.sh
```

---

## Subcommand: doctor

Diagnose common installation and runtime issues.

### Step 1: Node.js Version

```bash
node -v
```
- v16+ → PASS
- < v16 → FAIL: "Node.js 16+ required (found {version})"
- not found → FAIL: "Node.js not installed"

### Step 2: Symlink Validity

For each installation path (global, project):
- Symlink exists? → check target exists
- Target exists? → check it's a directory with `plugin.json`
- If broken symlink → FAIL: "Broken symlink: {path} → {target} (target missing)"

### Step 3: Plugin Structure

From the resolved plugin root, check required files exist:
- `plugin.json` → required
- `hooks/hooks.json` → required
- `hooks/uam-write-guard.mjs` → required
- `hooks/uam-validate-output.mjs` → required
- `hooks/uam-phase-controller.mjs` → required
- `hooks/uam-keyword-detector.mjs` → required
- `hooks/lib/uam-state.mjs` → required
- `hooks/lib/stdin.mjs` → required
- `agents/` directory with at least 1 `.md` file → required

Report each as PASS/FAIL.

### Step 4: Hook Registration

Read `hooks/hooks.json` and verify:
- `PreToolUse` has entry with matcher `Edit|Write|NotebookEdit`
- `PostToolUse` has entry with matcher `Task`
- `Stop` has entry
- `UserPromptSubmit` has entry

For each → PASS or FAIL with specific missing detail.

### Step 5: Hook Executability

For each hook .mjs file, test execution:
```bash
echo '{}' | node {hook_path} 2>/dev/null
```
- Exit code 0 → PASS
- Non-zero → FAIL: "Hook crashes on empty input: {hook_file}"

### Step 6: File Permissions

Check hook files are readable and executable:
```bash
test -r {hook_path} && test -x {hook_path}
```
- If not executable, this is OK (node invokes directly), but warn if not readable.

### Step 7: State Directory

- `.uam/` exists? → INFO (active or leftover)
- `.uam/state.json` parseable? → PASS or WARN: "Corrupted state file"
- `.uam/state.json` has valid `current_phase`? → PASS or WARN

### Step 8: Output Diagnostic Report

```
UAM Doctor
━━━━━━━━━━
Environment:
  [PASS] Node.js: {version}

Installation:
  [{PASS|FAIL}] Global symlink: {detail}
  [{PASS|FAIL}] Project symlink: {detail}

Plugin Structure:
  [{PASS|FAIL}] plugin.json
  [{PASS|FAIL}] hooks/hooks.json
  [{PASS|FAIL}] hooks/uam-write-guard.mjs
  [{PASS|FAIL}] hooks/uam-validate-output.mjs
  [{PASS|FAIL}] hooks/uam-phase-controller.mjs
  [{PASS|FAIL}] hooks/uam-keyword-detector.mjs
  [{PASS|FAIL}] hooks/lib/uam-state.mjs
  [{PASS|FAIL}] hooks/lib/stdin.mjs
  [{PASS|FAIL}] agents/ ({N} agents)

Hook Registration:
  [{PASS|FAIL}] PreToolUse (Edit|Write|NotebookEdit)
  [{PASS|FAIL}] PostToolUse (Task)
  [{PASS|FAIL}] Stop
  [{PASS|FAIL}] UserPromptSubmit

Hook Executability:
  [{PASS|FAIL}] uam-write-guard.mjs
  [{PASS|FAIL}] uam-validate-output.mjs
  [{PASS|FAIL}] uam-phase-controller.mjs
  [{PASS|FAIL}] uam-keyword-detector.mjs

State:
  [{PASS|WARN|INFO}] {state detail}

Summary: {N} passed, {N} failed, {N} warnings
{If any FAIL: "Fix the above issues and re-run /uam:uam-manage doctor"}
{If all PASS: "All checks passed. UAM is healthy."}
```

---

## Error Handling

- If UAM is not installed at all → "UAM is not installed. Run install.sh first."
- If both global and project are installed → show both, note that global takes precedence
- If subcommand is unrecognized → show available subcommands: status, update, uninstall, doctor
