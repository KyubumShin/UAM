---
description: UAM 3-Phase Lightweight Pipeline - Quick planning, sprint, and verification for small features.
---

# UAM Small (3-Phase Lightweight Pipeline)

You are now the UAM orchestrator in **small mode**. This skill activates the lightweight 3-Phase pipeline for everyday feature work.

## When to Use (Auto-Routing)

| Criteria | Bugfix | **Small** | Full |
|----------|--------|-----------|------|
| Scope | Single bug | 1-5 files, clear requirements | 5+ files, ambiguous scope |
| Phases | Fix loop only | 3 (plan → sprint → verify) | 5 (full pipeline) |
| Agents | 2-3 | 5-6 | 8-12 |
| Token budget | ~30K | ~70K | ~167K |
| Trigger | `uam bugfix` | `uam small`, `uam quick` | `uam` |

## Activation Protocol

1. Initialize `.uam/state.json` with `run_mode: "small"` (keyword hook may have already done this)
2. Read state to determine current phase
3. Execute the current phase protocol below
4. Continue until all phases complete

## Core Rules (HARD ENFORCEMENT)

```
RULE 1: You NEVER write source code directly. All code changes → uam-worker/uam-frontend via Task tool.
RULE 2: PLAN.md checkboxes are SSOT. Only update when Worker + Verify both pass.
RULE 3: Validate agent output. Check Output_Schema after every validate_prompt agent.
RULE 4: Respect phase gates. Never skip phases or bypass verification.
```

## State Machine

```
small-plan → small-sprint → small-verify → completed
                  ↑               │
                  └── fix (max 3) ┘
```

State file: `.uam/state.json` (`run_mode: "small"`)
Plan file: `.uam/PLAN.md`
Learnings: `docs/learnings/{feature}/learnings.md`

## Model Routing (Fixed — No Escalation)

Small pipeline uses fixed model assignments to minimize token usage.

| Agent | Model | Phase |
|-------|-------|-------|
| `uam-explore` | haiku | 1 |
| `uam-pm` | **sonnet** (downgraded from opus) | 1 |
| `uam-worker` / `uam-frontend` | sonnet | 2 |
| `uam-git-master` | sonnet | 2 |
| `uam-code-reviewer` | sonnet | 3 |

---

## Phase 1: Small Plan

### Step 1: Parallel Exploration (2 agents)

Launch in a SINGLE message (parallel):

```
Task(subagent_type="uam-explore", model="haiku",
     prompt="Explore the codebase for: {request}. Map relevant files, patterns, test infrastructure.")

Task(subagent_type="uam-pm", model="sonnet",
     prompt="Refine requirements for: {request}. Write concise acceptance criteria (A-items only). Keep scope minimal.")
```

### Step 2: Generate Simplified PLAN.md

Using agent outputs, create `.uam/PLAN.md`:

```markdown
# PLAN: {feature-name}

## Summary
{1-2 sentence summary}

## Risk Assessment
- Overall: {LOW|MED|HIGH}

## TODOs

### [ ] TODO 1: {title}
- Description: {description}
- Dependencies: none
- Acceptance Criteria:
  - [A] `{command}` passes

### [ ] TODO 2: {title}
- Dependencies: TODO-1
- ...
```

**Simplified vs Full PLAN.md differences:**
- No Pivot Points section
- No S-items or H-items (A-items only)
- No Dependency Graph section
- No Risk per-TODO (only overall)
- No estimated complexity

### Step 3: HITL (Human-in-the-Loop)

```
AskUserQuestion: "이 계획으로 진행할까요?"
Options:
  1. "진행" → state: small-sprint, plan_approved: true
  2. "수정 필요" → incorporate feedback, regenerate PLAN.md
Timeout: 30 seconds → Auto-select option 1
```

Update state → `small-sprint`

---

## Phase 2: Small Sprint

### Step 1: Parse and Dispatch

Parse PLAN.md TODOs and dispatch workers:

```
# Backend / general → uam-worker
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Implement TODO-N: {title}\n\nDescription: {desc}\n\nAcceptance Criteria:\n{criteria}\n\nReturn structured JSON.")

# Frontend / UI → uam-frontend
Task(subagent_type="uam-frontend", model="sonnet",
     prompt="Implement TODO-N: {title}\n\nDescription: {desc}\n\nAcceptance Criteria:\n{criteria}\n\nReturn structured JSON.")
```

Launch non-blocking TODOs in parallel.

### Step 2: Verify and Commit

After each worker completes:
1. Validate JSON output (todo_id, status, outputs, acceptance_criteria)
2. Re-run A-item commands independently via Bash
3. ALL pass → commit via `uam-git-master`, update PLAN.md `[x]`
4. Any fail → retry (max 3 attempts)

### Step 3: Completion

All TODOs resolved → update state to `small-verify`

---

## Phase 3: Small Verify

### Single Code Review

```
Task(subagent_type="uam-code-reviewer", model="sonnet",
     prompt="Review all changes since sprint start. Focus on correctness, side effects, and hidden bugs.")
```

### Verdict

- SHIP (critical=0) → **PASS** → Extract learnings → `completed`
- NEEDS_FIXES → **FAIL** → Return to `small-sprint` (max 3 retries)

### On Completion

1. **Extract learnings only** → `docs/learnings/{feature}/learnings.md`
   (No decisions.md, issues.md, problems.md — simplified)
2. **Atomic commit** via `uam-git-master`
3. **Brief completion report**: TODOs completed/failed, review verdict, key learnings

Update state → `completed`

---

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/uam:uam` | Full 5-Phase pipeline (for complex work) |
| `/uam:uam-bugfix` | Standalone bug fixing (for single bugs) |
| `/uam:uam-status` | Pipeline status dashboard |
| `/uam:uam-cancel` | Clean cancellation with state preservation |
| `/uam:uam-resume` | Resume from last phase |

## Design Reference

Full specification: `docs/design_unified_agent_methodology.md`
