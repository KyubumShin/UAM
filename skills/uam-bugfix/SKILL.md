---
description: UAM standalone bug fix - adaptive 3-phase repair with circuit breaker (outside main pipeline)
---

# UAM Bugfix

Standalone adaptive bug fixing protocol. Use this for targeted bug fixes **outside** the main UAM pipeline.
Adapted from hoyeon's /bugfix pattern with UAM's circuit breaker logic.

## When to Use

- Quick bug fix that doesn't need full 5-Phase pipeline
- Production hotfix with fast turnaround
- Isolated bug that doesn't require re-planning

For comprehensive feature work, use the full `/uam:uam` pipeline instead.

## Protocol

### Phase A: Diagnosis (Read-Only)

Launch diagnostic agents in parallel:

```
Task(subagent_type="uam-explore", model="haiku",
     prompt="Find all files related to: {bug description}. Map call chains and data flow.")

Task(subagent_type="uam-debugger", model="sonnet",
     prompt="Diagnose root cause of: {bug description}. Reverse call stack, identify Bug Type and Severity.")
```

After both complete, synthesize:
- Root cause identified? → Phase B
- Root cause unclear? → Ask user for more context

### Phase B: Fix (max 3 attempts)

#### Attempt Loop

```
for attempt in [1, 2, 3]:
    # 1. Dispatch fix worker
    Task(subagent_type="uam-worker", model="sonnet",
         prompt="Fix bug: {description}\n\nRoot cause: {diagnosis}\n\nAttempt: {N}/3\n\n{previous failure context if retry}")

    # 2. Verify fix
    Run acceptance criteria commands via Bash

    # 3. Evaluate
    if ALL pass → Phase C (success)
    if attempt < 3 → classify failure, adjust approach
    if attempt == 3 → Circuit Breaker
```

#### Failure Classification (between attempts)

| Pattern | Strategy |
|---------|----------|
| Different error than before | Simple retry with new context |
| Same error repeated | Escalate: `model="opus"` for worker |
| Fix caused new failures | Revert changes, try different approach |

#### Circuit Breaker (3 failures)

When all 3 attempts fail:
```
AskUserQuestion: "3회 시도 실패. 어떻게 진행할까요?"
Options:
  1. "전체 파이프라인으로 전환" → Start /uam:uam with bug context
  2. "수동 수정" → Show diagnosis + failed attempts summary
  3. "포기" → Clean up and stop
```

### Phase C: Verify & Commit

1. Re-run all related tests (not just the fixed one)
2. Check for regressions with `uam-code-reviewer`:

```
Task(subagent_type="uam-code-reviewer", model="sonnet",
     prompt="Review bugfix changes. Focus on: regression risk, edge cases, test coverage.")
```

3. If review passes:
```
Task(subagent_type="uam-git-master", model="sonnet",
     prompt="Commit bugfix: {description}. Atomic commit with conventional format.")
```

4. Output fix report:

```
Bugfix Complete
━━━━━━━━━━━━━
Bug:       {description}
Root Cause: {diagnosis summary}
Fix:        {what was changed}
Attempts:   {N}/3
Files:      {list of changed files}
Tests:      {pass/total} passing
Review:     {SHIP|NEEDS_FIXES}
Commit:     {commit hash}
```

## Orchestrator-Worker Rule

The bugfix skill follows the same hard enforcement as the main pipeline:
- Orchestrator NEVER writes source code directly
- All fixes go through `uam-worker` agents via Task tool
- Write guard hook applies during bugfix as well

## Differences from Main Pipeline

| Aspect | Main Pipeline | Bugfix |
|--------|--------------|--------|
| Planning | Full Phase 1 (6 agents) | Diagnosis only (2 agents) |
| Scope | Feature-level | Single bug |
| PLAN.md | Required | Not used |
| Quality Gate | 3 gates | Review only |
| Fix attempts | 10 (configurable) | 3 (hard limit) |
| State management | `.uam/state.json` | No persistent state |
| Learning extraction | Phase 5 | Inline report |
