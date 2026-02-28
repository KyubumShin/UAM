---
description: Resume cancelled or interrupted UAM pipeline from last checkpoint
---

# UAM Resume

Resume a previously cancelled or interrupted UAM pipeline from the last checkpoint.

## Protocol

### Step 1: Validate State

Read `.uam/state.json`:
- If no state file → "No UAM pipeline to resume. Start with 'uam' keyword."
- If current_phase = "completed" → "Pipeline already completed. Start new with 'uam'."
- If current_phase is active (phase1-5) → "Pipeline is already active. Use /uam:uam-status to check progress."

Expected state: `current_phase = "cancelled"` with `resume_point` field.

### Step 2: Restore Context

Read these files to rebuild context:

```
1. .uam/state.json      → pipeline state, progress snapshot
2. .uam/PLAN.md          → TODO list and acceptance criteria
3. docs/learnings/{feat}/ → any learnings from previous run
```

### Step 3: Display Resume Summary

```
UAM Pipeline Resume
━━━━━━━━━━━━━━━━━━
Pipeline:     {pipeline_id}
Cancelled at: {cancelled_at} ({cancelled_phase})
Resuming:     {resume_point}

Previous Progress:
  TODOs: {completed}/{total}
  Gates: G1={result} G2={result} G3={result}
  Fix loops used: {count}/{max}

Resuming from {resume_point}...
```

### Step 4: Phase-Specific Resume Logic

#### Resume Phase 1 (Quick Plan)

- If PLAN.md exists → Skip agent exploration, go directly to HITL
- If no PLAN.md → Full Phase 1 restart (explore + analyze + plan)

#### Resume Phase 2 (MVP Sprint)

- Re-parse PLAN.md for incomplete TODOs (`### [ ]`)
- Skip completed TODOs (`### [x]`)
- Dispatch workers only for remaining TODOs
- Continue dependency-aware parallel execution

#### Resume Phase 3 (Quality Gate)

- Check which gates were already evaluated
- Re-run only failed or unevaluated gates
- If gate1_passed=true, skip to Gate 2
- If gate1 & gate2 passed, skip to Gate 3

#### Resume Phase 4 (Fix Loop)

- Resume from Phase 3 (re-evaluate gates after previous fixes)
- Carry forward fix_loop_count and pass_rate_history
- ConvergenceDetector uses existing history for trend analysis

#### Resume Phase 5 (Finalize)

- Check which finalization steps were completed
- Continue from where it stopped (learnings → memory → commits → report)

### Step 5: Activate Pipeline

Update state:
```json
{
  "current_phase": "{resume_point}",
  "resumed_at": "{ISO timestamp}",
  "resumed_from": "cancelled"
}
```

Then execute the phase protocol from `/uam:uam-run` or the embedded protocol in `/uam:uam`.

## Edge Cases

| Scenario | Action |
|----------|--------|
| PLAN.md was manually edited | Accept edits, use current PLAN.md as is |
| Source files changed since cancel | Workers will work with current codebase state |
| State file corrupted | Report error, suggest /uam:uam-cancel --force |
| Multiple cancellations | Use most recent cancellation snapshot |
| Fix loop count near limit | Warn user, offer to reset fix_loop_count |

## Safety Rules

- NEVER skip the resume summary (user must see what's being resumed)
- NEVER reset progress (completed TODOs stay completed)
- Carry forward ALL convergence data (pass_rate_history is critical)
- Re-read PLAN.md fresh (may have been manually updated)
