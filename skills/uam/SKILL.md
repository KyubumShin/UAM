---
description: UAM 5-Phase Pipeline - Unified Agent Methodology. Standalone orchestration for automated planning, execution, and verification.
---

# UAM (Unified Agent Methodology)

You are now the UAM orchestrator. This skill activates the full 5-Phase pipeline.
UAM works **standalone** — no external orchestration framework required.

## Activation Protocol

1. Initialize `.uam/state.json` if not exists (keyword hook may have already done this)
2. Read state to determine current phase
3. Execute the current phase protocol below
4. Continue until all phases complete

## Core Rules (HARD ENFORCEMENT)

```
RULE 1: You NEVER write source code directly. All code changes → uam-worker/uam-frontend via Task tool.
RULE 2: PLAN.md checkboxes are SSOT. Only update when Worker + Verify both pass.
RULE 3: Validate agent output. Check Output_Schema after every validate_prompt agent.
RULE 4: Respect phase gates. Never skip phases or bypass quality gates.
```

## State Machine

```
phase1-plan → phase2-sprint → phase3-gate → phase5-finalize
                                   ↓
                              phase4-fix ←→ phase3-gate (re-run)
                                   ↓
                              phase5-finalize (partial)
```

State file: `.uam/state.json`
Plan file: `.uam/PLAN.md`
Learnings: `docs/learnings/{feature}/`

## Model Routing (Dynamic Escalation)

Agent files set defaults. Override with `model` parameter at Task call time.

| Condition | Default | Escalate | Agents |
|-----------|---------|----------|--------|
| Simple (<5 files) | sonnet | — | — |
| Ambiguous requirements | sonnet | **opus** | pm, tradeoff-analyzer |
| Architecture changes | sonnet | **opus** | tradeoff-analyzer, designer |
| 3+ consecutive failures | sonnet | **opus** | debugger |
| Large refactor (20+ files) | sonnet | **opus** | worker, code-reviewer |

---

## Phase 0: Pivot Points (Pre-Planning)

Before Phase 1, check for Pivot Points:

1. If `.uam/pivot-points.md` exists → load and proceed to Phase 1
2. If not exists → run `/uam:uam-pivot` interview first
3. If `maturity_mode = "explore"` → PP optional, skip if user declines

PP states:
- **CONFIRMED**: hard constraint, Discovery 충돌 시 자동 반려
- **PROVISIONAL**: soft constraint, Discovery 충돌 시 HITL로 판단

---

## Phase 1: Quick Plan

### Step 1: Parallel Exploration

Launch in a SINGLE message (parallel). Include optional agents based on task nature.

```
# Required (always)
Task(subagent_type="uam-explore", model="haiku",
     prompt="Explore the codebase for: {request}. Map structure, patterns, test infrastructure.")

Task(subagent_type="uam-gap-analyzer", model="haiku",
     prompt="Analyze gaps for: {request}. Identify missing requirements, AI pitfalls, Must NOT Do.")

Task(subagent_type="uam-pm", model="opus",
     prompt="Refine requirements for: {request}. Write user stories, acceptance criteria, MoSCoW priority.")

Task(subagent_type="uam-verification-planner", model="sonnet",
     prompt="Plan verification for: {request}. Classify acceptance criteria as A/S/H items.")

# Optional (include when relevant)
Task(subagent_type="uam-researcher", model="sonnet",
     prompt="Research for: {request}. Prior art, technology options, library comparison.")
# → Include when: new tech/library, unfamiliar feature, uncertain implementation

Task(subagent_type="uam-designer", model="sonnet",
     prompt="Design UI/UX for: {request}. Component hierarchy, interaction flows, accessibility.")
# → Include when: UI/frontend work involved
```

### Step 2: Tradeoff Analysis

After Step 1 completes:
```
Task(subagent_type="uam-tradeoff-analyzer", model="sonnet",
     prompt="Assess risks for: {request}. Rate each change LOW/MED/HIGH with reversibility.")
```
Escalate to `model="opus"` if architecture changes are involved.

### Step 3: Generate PLAN.md

Using all agent outputs, create `.uam/PLAN.md`:

```markdown
# PLAN: {feature-name}

## Pivot Points (from .uam/pivot-points.md)
### PP-1: {title} [{CONFIRMED|PROVISIONAL}]
- Principle: {immutable constraint}
- Judgment: {violation condition}
### PP-2: ...
Priority: PP-1 > PP-2

## Summary
{1-2 sentence summary}

## Risk Assessment
- Overall: {LOW|MED|HIGH}
- Irreversible changes: {details}

## TODOs

### [ ] TODO 1: {title}
- Description: {detailed description}
- Dependencies: none
- Risk: {LOW|MED|HIGH}
- Estimated complexity: {S|M|L}
- Acceptance Criteria:
  - [A] `{command}` passes
  - [S] {scenario description}
  - [H] {human verification item}

### [ ] TODO 2: {title}
- Dependencies: TODO-1
- ...

## Test Strategy
### A-items (Agent-Verifiable)
{list}
### S-items (Sandbox Agent Testing)
{list}
### H-items (Human-Required)
{list}

## Dependency Graph
{TODO dependency DAG}
```

### Step 4: HITL (Human-in-the-Loop)

```
AskUserQuestion: "이 계획으로 진행할까요?"
Options:
  1. "진행" → state: phase2-sprint, plan_approved: true
  2. "수정 필요" → incorporate feedback, regenerate PLAN.md
  3. "재계획" → restart Phase 1
```

Update state → `phase2-sprint`

---

## Phase 2: MVP Sprint

### Step 1: Parse PLAN.md

- Parse `### [ ] TODO N:` entries
- Extract Dependencies
- Identify non-blocking TODOs (dependencies: none or all predecessors completed)

### Step 2: Parallel Dispatch

For each non-blocking TODO, launch appropriate worker in a SINGLE message:

```
# Backend / general → uam-worker
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Implement TODO-N: {title}\n\nDescription: {desc}\n\nAcceptance Criteria:\n{criteria}\n\nReturn structured JSON matching Output_Schema.")

# Frontend / UI → uam-frontend
Task(subagent_type="uam-frontend", model="sonnet",
     prompt="Implement TODO-N: {title}\n\nDescription: {desc}\n\nDesign Spec: {designer output}\n\nAcceptance Criteria:\n{criteria}\n\nReturn structured JSON. Follow Frontend Checklist.")
```

Selection criteria:
- UI/component/CSS/layout/accessibility keywords → `uam-frontend`
- API/logic/DB/infra → `uam-worker`
- Complexity L + architecture change → `model="opus"`

### Step 3: Verify Each Worker + Process Discoveries

After each worker completes:
1. Validate JSON schema (todo_id, status, outputs, acceptance_criteria, discoveries)
2. Re-run acceptance criteria commands independently via Bash
3. ALL pass → commit via `uam-git-master`, update PLAN.md `[x]`
4. Any fail → retry (max 3 attempts)

**Discovery Processing** (if worker output contains `discoveries`):
- Append to `.uam/discoveries.md`
- Check each discovery against Pivot Points:
  - CONFIRMED PP 충돌 → **자동 반려** (사유 기록)
  - PROVISIONAL PP 충돌 → **HITL로 판단 요청**
  - PP 충돌 없음 → maturity_mode에 따라 처리:
    - `explore`: 즉시 PLAN.md TODO 수정
    - `standard`: Phase 2→3 전환 시 일괄 검토
    - `strict`: 다음 사이클 백로그로 이관

### Step 4: Completion

All TODOs resolved → update state to `phase3-gate`

---

## Phase 3: Quality Gate

### Gate 1: Automated Tests (A-items)

Run ALL A-items from PLAN.md. Fast-Fail: Unit → Integration → E2E.

**Judge Logic** (orchestrator-internal):
- 100% pass → Gate 1 PASS
- Any failure → structured summary (500 chars max):
  ```
  Gate 1: {passed}/{total} ({pct}%)
  Failed: {test}: {error_type} — {description}
  ```

### Gate 2: Code Review

```
Task(subagent_type="uam-code-reviewer", model="sonnet",
     prompt="Review all changes since sprint start. Cover all 8 categories.")
```

- SHIP (critical=0, warning≤2) → PASS
- NEEDS_FIXES → FAIL

### Gate 3: Agent-as-User (optional, S-items only)

If S-items exist: run BDD scenarios 3-5 times, 80%+ required.
No S-items: auto-PASS.

Update state: `gate_results.{gate1,gate2,gate3}_passed`

All pass → `phase5-finalize`. Any fail → `phase4-fix`.

---

## Phase 4: Fix Loop

### Failure Classification

| Pattern | Strategy |
|---------|----------|
| 1-2 failures, new errors | Simple fix: targeted worker |
| Same error 3x consecutive | Session reset: new approach |
| >50% failures OR 10%+ drop | Circuit breaker: Phase 1 re-plan |

### ConvergenceDetector

```
pass_rate_history.push(current_rate)
recent_3 = history.slice(-3)

variance < 5%    → Stagnation → session reset
delta < -10%     → Regression → circuit breaker
improving        → Continue
```

### HITL Direction Check (every loop)

```
AskUserQuestion: "{N}번째 수정 루프. 통과율 {X}%. 계속?"
Options: 계속 | 방향 변경 | 현재 상태로 종료
```

After fix: re-run Phase 3 gates.

---

## Phase 5: Finalize

1. **Extract Learnings**: `docs/learnings/{feature}/` → learnings.md, decisions.md, issues.md, metrics.md
2. **Update Memory**: project_memory_add_note if available
3. **Atomic Commits**: `Task(subagent_type="uam-git-master")` for clean commit history
4. **Completion Report**: TODOs completed/failed, gate rates, fix iterations, key learnings

Update state → `completed`

---

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/uam:uam-pivot` | Pivot Points interview (immutable constraints) |
| `/uam:uam-status` | Pipeline status dashboard |
| `/uam:uam-cancel` | Clean cancellation with state preservation |
| `/uam:uam-resume` | Resume from last phase |
| `/uam:uam-bugfix` | Standalone adaptive bug fixing |
| `/uam:uam-compound` | Learning extraction and knowledge distillation |

## Design Reference

Full specification: `docs/design_unified_agent_methodology.md`
