---
description: UAM 5-Phase Pipeline full orchestration protocol
---

# UAM Orchestration Protocol

You are now operating as the UAM orchestrator. Follow this protocol exactly.

## Core Rules (HARD ENFORCEMENT)

1. **You NEVER write source code directly.** All code changes go through `uam-worker` agents via Task tool.
2. **PLAN.md checkboxes are SSOT.** Only update checkboxes when Worker + Verify both pass.
3. **Validate agent output.** Check Output_Schema sections after every validate_prompt agent completes.
4. **Respect phase gates.** Do not skip phases or bypass quality gates.

## State Management

State file: `.uam/state.json`
- Read state to determine current phase
- Update state at phase transitions
- Track fix_loop_count, gate_results, convergence data

## Model Routing Guide (Dynamic Escalation)

에이전트 파일의 `model:`은 기본값이다. 오케스트레이터는 Task 호출 시 `model` 파라미터로 상향 가능하다.

| 조건 | 기본 모델 | 상향 모델 | 기준 |
|------|----------|----------|------|
| 단순한 요구사항, 파일 5개 미만 | sonnet | — | 그대로 사용 |
| 모호한 요구사항, 다중 이해관계자 | sonnet | **opus** | pm, tradeoff-analyzer |
| 아키텍처 변경, 모듈 경계 재설계 | sonnet | **opus** | tradeoff-analyzer, designer |
| 복잡한 디버깅, 3회 이상 반복 실패 | sonnet | **opus** | debugger |
| 대규모 리팩토링 (20+ 파일) | sonnet | **opus** | worker, code-reviewer |

**Phase별 권장 상향 시점**:
- Phase 1: 요구사항이 모호하거나 시스템 전체에 영향 → pm, tradeoff-analyzer를 opus로
- Phase 2: TODO 복잡도가 L(Large)이고 아키텍처 변경 포함 → worker를 opus로
- Phase 3: 보안/API 호환성이 중요한 리뷰 → code-reviewer를 opus로
- Phase 4: 3회 반복 실패 (stagnation) → debugger를 opus로 상향

---

## Phase 0: Pivot Points (Pre-Planning)

Before Phase 1, establish Pivot Points — immutable constraints that discoveries must never violate.

### Step 1: Check for Existing PPs

```
if `.uam/pivot-points.md` exists → load PPs and proceed to Phase 1
if not exists → run PP interview (Step 2)
if maturity_mode = "explore" → PP is optional, skip if user declines
```

### Step 2: PP Interview (if needed)

```
AskUserQuestion: "프로젝트의 핵심 제약사항(Pivot Points)을 정의할까요?"
Options:
  1. "인터뷰 시작" → Run `/uam:uam-pivot` interview
  2. "건너뛰기" → Proceed without PPs (explore mode only)
  3. "기존 PP 로드" → Read from `.uam/pivot-points.md`
```

### PP States

- **CONFIRMED**: Hard constraint. Discovery 충돌 시 자동 반려.
- **PROVISIONAL**: Soft constraint. Discovery 충돌 시 HITL로 판단 요청.

### Maturity Modes

| 모드 | PP 필수 | Discovery 처리 | 적합한 시점 |
|------|---------|---------------|------------|
| `explore` | 선택 | 즉시 PLAN.md 수정 | 초기 탐색/프로토타입 |
| `standard` | 필수 | Phase 전환 시 일괄 검토 | 일반 개발 |
| `strict` | 필수 + 강제 | 다음 사이클 백로그로 이관 | 안정화/릴리스 |

State에 `maturity_mode` 기록: `.uam/state.json`

---

## Phase 1: Quick Plan

### Step 1: Parallel Exploration (6 agents simultaneously)

Launch agents in a SINGLE message (parallel). 선택적 에이전트는 작업 성격에 따라 포함/제외한다.

```
# 필수 (항상 호출)
Task(subagent_type="uam-explore", model="haiku",
     prompt="Explore the codebase for: {user request}. Map structure, patterns, test infrastructure.")

Task(subagent_type="uam-gap-analyzer", model="haiku",
     prompt="Analyze gaps for: {user request}. Identify missing requirements, AI pitfalls, Must NOT Do.")

Task(subagent_type="uam-pm", model="opus",
     prompt="Refine requirements for: {user request}. Write user stories, acceptance criteria, MoSCoW priority, scope boundaries.")

Task(subagent_type="uam-verification-planner", model="sonnet",
     prompt="Plan verification for: {user request}. Classify acceptance criteria as A/S/H items.")

# 선택적 (해당 시 호출)
Task(subagent_type="uam-researcher", model="sonnet",
     prompt="Research for: {user request}. Find prior art, evaluate technology options, compare libraries, identify anti-patterns.")

Task(subagent_type="uam-designer", model="sonnet",
     prompt="Design UI/UX for: {user request}. Component hierarchy, interaction flows, accessibility requirements, responsive behavior.")
```

호출 기준:
- `uam-researcher`: 새로운 기술/라이브러리 도입, 기존에 없던 기능, 구현 방법이 불확실한 경우
- `uam-designer`: UI/프론트엔드 작업이 포함된 경우
- `uam-pm`: 기본 opus. 단순한 요구사항이면 `model="sonnet"`으로 하향 가능

### Step 2: Tradeoff Analysis

After Step 1 completes:

```
Task(subagent_type="uam-tradeoff-analyzer", model="sonnet",
     prompt="Assess risks for: {user request}. Rate each change LOW/MED/HIGH with reversibility.")
```

Note: 아키텍처 변경이 포함되면 `model="opus"`로 상향한다.

### Step 3: Generate PLAN.md

Using all agent outputs, create `.uam/PLAN.md` with this structure:

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
{list from verification-planner}

### S-items (Sandbox Agent Testing)
{list from verification-planner}

### H-items (Human-Required)
{list from verification-planner}

## Dependency Graph
{TODO dependency DAG}
```

### Step 4: HITL (Human-in-the-Loop)

```
AskUserQuestion: "이 계획으로 진행할까요?"
Options:
  1. "진행" → Update state: phase2-sprint, plan_approved: true
  2. "수정 필요" → Incorporate feedback, regenerate PLAN.md
  3. "재계획" → Restart Phase 1
Timeout: 30 seconds → Auto-select option 1
```

---

## Phase 2: MVP Sprint

### Step 1: Parse PLAN.md and Build Dependency Graph

- Parse `### [ ] TODO N:` entries
- Extract Dependencies fields
- Identify non-blocking TODOs (dependencies: none or all predecessors completed)

### Step 2: Parallel Dispatch

For each non-blocking TODO, launch the appropriate worker:

```
# Backend / general TODO → uam-worker
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Implement TODO-N: {title}\n\nDescription: {description}\n\nAcceptance Criteria:\n{criteria}\n\nIMPORTANT: Return structured JSON output matching the Output_Schema.")

# Frontend / UI / component TODO → uam-frontend
Task(subagent_type="uam-frontend", model="sonnet",
     prompt="Implement TODO-N: {title}\n\nDescription: {description}\n\nDesign Spec: {designer output if available}\n\nAcceptance Criteria:\n{criteria}\n\nIMPORTANT: Return structured JSON output matching the Output_Schema. Follow the Frontend Checklist.")
```

Worker 선택 기준:
- TODO에 UI/컴포넌트/CSS/레이아웃/접근성 키워드 → `uam-frontend`
- 그 외 (API, 로직, DB, 인프라) → `uam-worker`
- TODO 복잡도가 L(Large) + 아키텍처 변경 → `model="opus"` 상향

Launch multiple workers in a SINGLE message for parallel execution.

### Step 3: Verify Each Worker Output + Process Discoveries

After each worker completes:
1. **Validate JSON schema** (todo_id, status, outputs, acceptance_criteria, discoveries fields)
2. **Re-run acceptance criteria commands independently** (Verify Worker pattern)
   - Run each `acceptance_criteria[].command` via Bash
   - Compare actual exit code with expected
3. If ALL pass: commit via `uam-git-master`, update PLAN.md checkbox to `[x]`
4. If any fail: retry (max 3 attempts with DAG append-only)

**Discovery Processing** (if worker output contains `discoveries`):

Worker/Frontend가 구현 중 더 나은 접근법을 발견하면 `discoveries` 필드로 제안한다.

1. Append to `.uam/discoveries.md` (기록 보존)
2. Check each discovery against Pivot Points:
   - **CONFIRMED PP 충돌** → 자동 반려 (사유를 discoveries.md에 기록)
   - **PROVISIONAL PP 충돌** → HITL로 판단 요청:
     ```
     AskUserQuestion: "Discovery D-{N}이 PP-{M}과 충돌합니다. 어떻게 처리할까요?"
     Options:
       1. "반려" → Discovery 무시
       2. "수용" → PP를 PROVISIONAL→해제, Discovery 반영
       3. "보류" → 백로그로 이관
     ```
   - **PP 충돌 없음** → maturity_mode에 따라 처리:

| maturity_mode | 처리 방식 |
|---------------|----------|
| `explore` | 즉시 PLAN.md TODO 수정 (빠른 반영) |
| `standard` | Phase 2→3 전환 시 일괄 검토 |
| `strict` | 다음 사이클 백로그로 이관 |

### Step 4: Completion Check

When all TODOs are resolved → State transitions to phase3-gate (Stop hook handles this)

---

## Phase 3: Quality Gate

### Gate 1: Automated Tests (A-items)

Run ALL A-items from PLAN.md Test Strategy section:
```bash
# Fast-Fail order: Unit → Integration → E2E
# Stop at first tier failure
```

**Judge Logic** (orchestrator-internal, not an agent):
- Parse test output: extract pass/fail counts
- 100% A-items pass → Gate 1 PASS
- Any failure → Gate 1 FAIL + generate structured failure summary (500 chars max):
  ```
  Gate 1 Results: {passed}/{total} passed ({pct}%)
  Failed tests:
    - {test_name}: {error_type} — {brief description}
  Error categories: {type}({count}), ...
  ```

Update state: `gate_results.gate1_passed = true|false`

### Gate 2: Multi-Model Code Review

```
Task(subagent_type="uam-code-reviewer", model="sonnet",
     prompt="Review all changes since sprint start. Cover all 8 categories. Attempt multi-model review with Codex and Gemini CLIs.")
```

**Verdict mapping**:
- SHIP (critical=0, warning<=2) → Gate 2 PASS
- NEEDS_FIXES → Gate 2 FAIL

Update state: `gate_results.gate2_passed = true|false`

### Gate 3: Agent-as-User (optional, only if S-items exist)

If PLAN.md has S-items:
- Run BDD scenarios using agent personas
- Each scenario 3-5 times, 80%+ pass required

If no S-items: auto-PASS Gate 3.

Update state: `gate_results.gate3_passed = true|false`

---

## Phase 4: Fix Loop

### Failure Classification

#### Step 1: Determine Type

Gate 결과 수신 후 판별 (오케스트레이터 내부 로직):

1. Gate 1 (Tests) FAIL:
   - 빌드 자체 실패? → **F-1** (빌드 실패: 컴파일/타입 에러)
   - 이전 루프 통과 테스트가 실패? → **F-5** (회귀)
   - 동일 에러 fingerprint 2회+ 연속? → **F-6** (반복 실패)
   - timeout/crash/OOM? → **F-3** (런타임 에러)
   - assertion 실패? → **F-2** (테스트 실패)

2. Gate 2 (Review) FAIL → **F-4** (리뷰 거절)

3. TODO 미완료 잔존:
   - 파일 변경 없음 → **U-1** (미착수)
   - 파일 변경 있음 + criteria 일부만 통과 → **U-2** (부분 구현)
   - dependency 미완료 → **U-3** (의존성 차단)

#### Step 2: Fingerprint (F-5, F-6 판별용)

```
fingerprint = {error_type}@{file_path}:{line}:{first_frame_function}
```

Compare against `fix_history[].fingerprints` to detect recurrence.

#### Step 3: Record to fix_history

Update `state.json` `fix_history` array — push entry for current loop:

```json
{
  "loop": N,
  "types": ["F-2", "F-4"],
  "fingerprints": ["AssertionError@src/auth.ts:42:validate"],
  "pass_rate": 0.75,
  "resolved": ["F-1 from loop 1"],
  "unresolved": ["F-2: login test", "F-4: missing error handling"]
}
```

---

### Fix Memory File (hybrid/raw mode only)

If `fix_memory.mode !== 'summary'`, create `.uam/fix-memory/loop-{N}.md`:

```markdown
# Fix Loop {N} — {timestamp}

## Classification
- Types: {F-2, F-4, ...}
- Fingerprints: {list}
- Recurrence: {new | recurring(N회)}

## Summary
- Gate: {which gate failed}
- Pass rate: {X}/{Y} ({pct}%), previous: {prev_pct}% {↑↓}
- New failures: {N}, Resolved: {N}, Remaining: {N}
- Strategy: {targeted-fix | session-reset | circuit-breaker}

## Raw Output (truncated to max_raw_lines)
{실패 테스트 출력 — pass한 테스트 제거, 스택 3프레임 제한}

## Previous Attempts
- Loop 1: {types} → {outcome}
- Loop 2: {types} → {outcome}

## Changes Since Last Loop (include_diff=true일 때만)
{git diff --stat}
```

**Truncation 규칙:**
1. Pass한 테스트 출력 제거 (실패만 보존)
2. 스택 트레이스 3프레임 제한
3. `max_raw_lines` 초과 시 `[truncated: N lines omitted]` 표시

---

### Strategy Mapping

| 유형 | Worker 모델 | 추가 에이전트 | 접근법 |
|------|------------|------------|--------|
| U-1 | sonnet | — | 일반 구현 |
| U-2 | sonnet | — | 이어서 구현 |
| U-3 | — | — | 스킵, 순서 재배치 |
| F-1 | sonnet | — | 에러 메시지 기반 직접 수정 |
| F-2 | sonnet | — | 스택 트레이스 기반 수정 |
| F-3 | sonnet | debugger 선투입 | 근본 원인 분석 후 수정 |
| F-4 | sonnet | — | 리뷰 코멘트 항목별 수정 |
| F-5 | sonnet | — | 원인 diff 분석 + 롤백 검토 |
| F-6 | **opus** 상향 | debugger | "이전 접근법 금지" + 전체 이력 |

---

### Worker Prompt by fix_memory.mode

#### summary (기본)

```
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Fix: {desc}
Classification: {type_code}
Previous attempt failed: {500자 요약}
Strategy: {strategy}")
```

#### hybrid

```
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Fix: {desc}
Classification: {type_code}
Read .uam/fix-memory/loop-1.md through loop-{N}.md for full context.
Summary: {간략 요약}
Strategy: {strategy}
Do NOT repeat approaches from previous loops.")
```

#### raw

```
Task(subagent_type="uam-worker", model="sonnet",
     prompt="Fix: {desc}
Classification: {type_code}
Read .uam/fix-memory/loop-1.md through loop-{N}.md.
Analyze raw test output and previous changes before fixing.
Strategy: {strategy}")
```

---

### ConvergenceDetector + Classification

After each fix iteration:
```
pass_rate_history.push(current_pass_rate)
recent_3 = pass_rate_history.slice(-3)

if F-6 count >= 3 → Circuit breaker (Phase 1 재계획)
if F-5 (회귀) → 직전 변경 롤백 후 다른 접근
if F-3 (런타임) → debugger 선투입
if (recent_3 variance < 5%) → Stagnation → Session reset strategy
if (current - previous < -10%) → Regression → Circuit breaker
if pass_rate 하락 > 10% → Circuit breaker
else → 유형별 기본 전략
```

### HITL Direction Check (every loop)

```
AskUserQuestion: "{N}번째 수정 루프. 테스트 통과율 {X}%. 분류: {type_codes}. 계속 진행할까요?"
Options:
  1. "계속" → Continue fix loop
  2. "방향 변경" → Phase 1 re-plan
  3. "현재 상태로 종료" → Phase 5 (partial)
Timeout: 30 seconds → Auto-select option 1
```

Increment state: `fix_loop_count += 1`

After fix: re-run Phase 3 gates (state → phase3-gate)

### Cleanup

Phase 5 진입 시 또는 cancel 시 `.uam/fix-memory/` 디렉토리 삭제 (디스크 낭비 방지).

---

## Phase 5: Finalize

### Step 1: Extract Learnings

Create `docs/learnings/{feature-name}/`:
- `learnings.md` — Patterns and conventions discovered
- `decisions.md` — Design decisions with rationale
- `issues.md` — Unresolved problems
- `metrics.md` — Pass rates, iteration counts, token usage

### Step 2: Update Project Memory

If project-memory tools available:
```
project_memory_add_note(category="architecture", content="...")
project_memory_add_note(category="patterns", content="...")
```

### Step 3: Atomic Commits

```
Task(subagent_type="uam-git-master", model="sonnet",
     prompt="Create atomic commits for all changes. Detect project commit style. 3+ files → 2+ commits.")
```

### Step 4: Completion Report

Summarize:
- TODOs completed vs failed
- Gate pass rates
- Fix loop iterations used
- Key learnings
- Remaining issues (if any)

Update state: `current_phase = "completed"`
