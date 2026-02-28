---
description: UAM pipeline status dashboard - phase progress, TODO completion, gate results, convergence metrics
---

# UAM Status

Display the current UAM pipeline status with structured metrics.

## Protocol

### Step 1: Read State

Read `.uam/state.json` to get current pipeline state.
If no state file exists, report "UAM is not active."

### Step 2: Read PLAN.md

Read `.uam/PLAN.md` (or `PLAN.md`) to count TODO checkboxes:
- `### [x]` = completed
- `### [ ]` = pending
- `### [FAILED]` = failed

### Step 3: Generate Dashboard

Output a structured dashboard:

```
╔══════════════════════════════════════════════════╗
║  UAM Pipeline Status                             ║
╠══════════════════════════════════════════════════╣
║  Pipeline ID : {pipeline_id}                     ║
║  Feature     : {extracted from pipeline_id}      ║
║  Started     : {started_at}                      ║
║  Duration    : {calculated}                      ║
╠══════════════════════════════════════════════════╣
║  Current Phase: {phase} {phase_icon}             ║
║                                                  ║
║  Phase Progress:                                 ║
║  [1] Quick Plan      {✅|⬜|🔄}                 ║
║  [2] MVP Sprint      {✅|⬜|🔄}                 ║
║  [3] Quality Gate    {✅|⬜|🔄}                 ║
║  [4] Fix Loop        {✅|⬜|🔄|⏭️}             ║
║  [5] Finalize        {✅|⬜|🔄}                 ║
╠══════════════════════════════════════════════════╣
║  TODO Progress: {completed}/{total} ({pct}%)     ║
║  ████████░░░░░░░░ {progress bar}                 ║
║  Completed: {N}  Pending: {N}  Failed: {N}       ║
╠══════════════════════════════════════════════════╣
║  Quality Gates:                                  ║
║  Gate 1 (Tests):  {PASS|FAIL|PENDING}            ║
║  Gate 2 (Review): {PASS|FAIL|PENDING}            ║
║  Gate 3 (Agent):  {PASS|FAIL|PENDING|N/A}        ║
╠══════════════════════════════════════════════════╣
║  Fix Loop: {count}/{max}                         ║
║  Convergence: {improving|stagnating|regressing}  ║
║  Pass Rate History: {rates}                      ║
╚══════════════════════════════════════════════════╝
```

### Step 4: Phase-Specific Details

Based on current phase, add contextual information:

- **phase1-plan**: List agents launched, waiting for outputs
- **phase2-sprint**: Show per-TODO status, worker assignments, blocked TODOs
- **phase3-gate**: Show each gate's detailed results
- **phase4-fix**: Show failure pattern, strategy being used, convergence trend
- **phase5-finalize**: Show learnings extracted, commits made

### Step 5: Recommendations

Based on state, suggest next action:

| State | Recommendation |
|-------|---------------|
| phase1 + no agents launched | "Run Phase 1 exploration agents" |
| phase1 + agents complete | "Generate PLAN.md and get HITL approval" |
| phase2 + blocked TODOs | "Complete dependency TODOs first: {list}" |
| phase3 + gate failed | "Enter Phase 4 fix loop or re-plan" |
| phase4 + stagnating | "Consider model escalation or re-plan" |
| phase5 | "Finalize: extract learnings and commit" |
| completed | "Pipeline complete. Run /uam:uam-compound to extract knowledge" |
| cancelled | "Pipeline was cancelled. Run /uam:uam-resume to continue" |

## Error States

- No `.uam/` directory → "UAM has not been initialized. Say 'uam' or run /uam:uam to start."
- Corrupted state.json → "State file is corrupted. Run /uam:uam-cancel --force to reset."
- Missing PLAN.md in phase2+ → "PLAN.md not found. Return to Phase 1."
