---
description: UAM 3-Phase Lightweight pipeline orchestration protocol
---

# UAM Small Orchestration Protocol

You are now operating as the UAM orchestrator in **small mode**. Follow this protocol exactly.

## Core Rules (HARD ENFORCEMENT)

1. **You NEVER write source code directly.** All code changes go through `uam-worker` agents via Task tool.
2. **PLAN.md checkboxes are SSOT.** Only update checkboxes when Worker + Verify both pass.
3. **Validate agent output.** Check Output_Schema sections after every validate_prompt agent completes.
4. **Respect phase gates.** Do not skip phases or bypass verification.

## State Management

State file: `.uam/state.json` (`run_mode: "small"`)
- Read state to determine current phase
- Update state at phase transitions
- Track `fix_loop_count` (max 3), `gate_results.gate2_passed`

Key state differences from full pipeline:
- `run_mode: "small"`
- `current_phase`: `small-plan` | `small-sprint` | `small-verify` | `completed`
- `max_fix_loops: 3` (vs 10 in full)
- `max_total_tokens: 150000` (vs 500000 in full)

## Model Routing (Fixed — No Escalation)

Small pipeline uses fixed model assignments. Do NOT escalate to opus.

| Agent | Model | Phase | Notes |
|-------|-------|-------|-------|
| `uam-explore` | haiku | 1 | Codebase exploration |
| `uam-pm` | **sonnet** | 1 | Downgraded from opus — small scope doesn't need opus |
| `uam-worker` | sonnet | 2 | Backend/general implementation |
| `uam-frontend` | sonnet | 2 | Frontend/UI implementation |
| `uam-git-master` | sonnet | 2, 3 | Atomic commits |
| `uam-code-reviewer` | sonnet | 3 | Single code review |

---

## Phase 1: Small Plan

### Step 1: Parallel Exploration (2 agents)

Launch in a SINGLE message (parallel):

```
Task(subagent_type="uam-explore", model="haiku",
     prompt="Explore the codebase for: {user request}. Map relevant files, existing patterns, test infrastructure. Keep report concise.")

Task(subagent_type="uam-pm", model="sonnet",
     prompt="Refine requirements for: {user request}. Write concise user stories and acceptance criteria. A-items only (agent-verifiable commands). MoSCoW priority. Keep scope minimal — this is a small feature.")
```

**Agents NOT used in small mode** (vs full pipeline):
- `uam-gap-analyzer`: scope is small enough to not need gap analysis
- `uam-tradeoff-analyzer`: risk is low for small features
- `uam-verification-planner`: A-items only, no need for A/S/H classification
- `uam-researcher`: no new tech exploration needed
- `uam-designer`: delegate to uam-frontend if UI work needed

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
- Description: {detailed description}
- Dependencies: none
- Acceptance Criteria:
  - [A] `{command}` passes
  - [A] `{command}` passes

### [ ] TODO 2: {title}
- Dependencies: TODO-1
- Acceptance Criteria:
  - [A] `{command}` passes
```

**Simplified PLAN.md rules:**
- NO Pivot Points section (PP interview skipped)
- NO S-items or H-items (A-items only — agent-verifiable)
- NO separate Test Strategy section (criteria are inline)
- NO Dependency Graph section
- NO per-TODO risk rating (only overall)

### Step 3: HITL (Human-in-the-Loop)

```
AskUserQuestion: "이 계획으로 진행할까요?"
Options:
  1. "진행" → Update state: small-sprint, plan_approved: true
  2. "수정 필요" → Incorporate feedback, regenerate PLAN.md
Timeout: 30 seconds → Auto-select option 1
```

---

## Phase 2: Small Sprint

### Step 1: Parse PLAN.md

- Parse `### [ ] TODO N:` entries
- Extract Dependencies fields
- Identify non-blocking TODOs

### Step 2: Parallel Dispatch

For each non-blocking TODO, launch the appropriate worker in a SINGLE message:

```
# Backend / general TODO → uam-worker
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Implement TODO-N: {title}\n\nDescription: {description}\n\nAcceptance Criteria:\n{criteria}\n\nIMPORTANT: Return structured JSON output matching the Output_Schema.")

# Frontend / UI TODO → uam-frontend
Task(subagent_type="uam-frontend", model="sonnet",
     prompt="Implement TODO-N: {title}\n\nDescription: {description}\n\nAcceptance Criteria:\n{criteria}\n\nIMPORTANT: Return structured JSON output matching the Output_Schema.")
```

Worker selection:
- UI/component/CSS/layout keywords → `uam-frontend`
- API/logic/DB/infra → `uam-worker`

### Step 3: Verify Each Worker Output

After each worker completes:
1. **Validate JSON schema** (todo_id, status, outputs, acceptance_criteria)
2. **Re-run acceptance criteria commands** independently via Bash
3. ALL pass → commit via `uam-git-master`, update PLAN.md `[x]`
4. Any fail → retry (max 3 attempts)

**No Discovery processing** in small mode (no Pivot Points → no conflict checks).

### Step 4: Completion Check

All TODOs resolved → State transitions to `small-verify` (Stop hook handles this)

---

## Phase 3: Small Verify

### Single Code Review

Run one code-reviewer pass (no multi-model, no Gate 1 docker tests, no Gate 3 agent-as-user):

```
Task(subagent_type="uam-code-reviewer", model="sonnet",
     prompt="Review all changes since sprint start. Focus on: correctness, side effects, hidden bugs, and production readiness. Keep review concise.")
```

### Verdict

- **SHIP** (critical=0) → Gate 2 PASS
  - Update state: `gate_results.gate2_passed = true`
  - Proceed to finalization
- **NEEDS_FIXES** (critical>0) → Gate 2 FAIL
  - Update state: `gate_results.gate2_passed = false`
  - Apply Fix Memory protocol (below), then retry (back to `small-sprint`, max 3 retries)

### Small Fix Memory Protocol

Small pipeline은 간소화된 분류 체계를 사용한다 (F-1, F-2, F-4만):

| 유형 | 설명 | 전략 |
|------|------|------|
| F-1 | 빌드 실패 (컴파일/타입 에러) | 에러 메시지 기반 직접 수정 |
| F-2 | 테스트 실패 (assertion fail) | 스택 트레이스 기반 수정 |
| F-4 | 리뷰 거절 (code-reviewer NEEDS_FIXES) | 리뷰 코멘트 항목별 수정 |

런타임(F-3), 회귀(F-5), 반복 실패(F-6)는 small pipeline에서 사용하지 않음.

#### fix_history 기록

각 retry 시 `state.json`의 `fix_history` 배열에 push:

```json
{
  "loop": N,
  "types": ["F-4"],
  "pass_rate": null,
  "resolved": [],
  "unresolved": ["review: missing error handling"]
}
```

#### Fix Memory File (hybrid/raw mode only)

If `fix_memory.mode !== 'summary'`, create `.uam/fix-memory/loop-{N}.md`:

```markdown
# Fix Loop {N} — {timestamp}

## Classification
- Types: {F-1|F-2|F-4}

## Summary
- Gate: Gate 2 (Code Review) FAIL
- Issues: {critical count} critical, {warning count} warnings

## Raw Output (truncated to max_raw_lines)
{code-reviewer 출력 중 NEEDS_FIXES 항목만}

## Previous Attempts
- Loop 1: {types} → {outcome}
```

#### Worker Prompt by fix_memory.mode

**summary** (기본):
```
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Fix review issues: {desc}
Classification: {type_code}
Review feedback: {500자 요약}")
```

**hybrid**:
```
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Fix review issues: {desc}
Classification: {type_code}
Read .uam/fix-memory/loop-1.md through loop-{N}.md for full context.
Summary: {간략 요약}
Do NOT repeat approaches from previous loops.")
```

**raw**:
```
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Fix review issues: {desc}
Classification: {type_code}
Read .uam/fix-memory/loop-1.md through loop-{N}.md.
Analyze raw review output before fixing.")
```

### Finalization (on pass)

1. **Extract learnings** → `docs/learnings/{feature}/learnings.md` only
   - No decisions.md, issues.md, metrics.md (simplified)
2. **Atomic commit** via `uam-git-master`
3. **Completion report**:
   - TODOs completed/failed
   - Code review verdict
   - Fix loop iterations used (if any)
   - Key learnings

Update state → `completed`

---

## Differences from Full Pipeline

| Aspect | Full (`uam`) | Small (`uam-small`) |
|--------|-------------|---------------------|
| Phases | 5 (plan → sprint → gate → fix → finalize) | 3 (plan → sprint → verify) |
| Planning agents | 4-6 parallel | 2 parallel (explore + pm) |
| PM model | opus | sonnet |
| Quality gates | 3 (docker + review + agent-as-user) | 1 (code review only) |
| Fix strategy | Adaptive 3-tier + ConvergenceDetector | Simple retry max 3 |
| Max fix loops | 10 | 3 |
| Token budget | 500K | 150K |
| Pivot Points | Full interview | Skipped |
| Learnings | 4 files | 1 file (learnings.md only) |
| Model escalation | Dynamic (sonnet → opus) | Fixed (no escalation) |
| A/S/H items | All three | A-items only |
