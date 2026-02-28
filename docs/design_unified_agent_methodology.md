# Unified Agent Methodology (UAM): 통합 에이전트 방법론 설계

- **작성일**: 2026-02-28
- **분류**: Design (design_)
- **연구 영역**: Agent Context Engineering / Evaluation Harness Design
- **기반 문서**:
  - `ref_three_system_comparison.md` — OMC vs hoyeon vs SG-Loop 3자 비교
  - `ref_hoyeon_sdd_pipeline_analysis.md` — hoyeon SDD 파이프라인 분석
  - `ref_sandbox_gated_iteration_loop.md` — SG-Loop 패턴 분석
  - `ref_ralph_vs_sg_loop_comparison.md` — Ralph vs SG-Loop 소스 기반 비교
  - `design_sg_loop_and_hybrid.md` — SG-Loop 및 하이브리드 구현 설계

---

## 목차

1. [설계 목표와 원칙](#1-설계-목표와-원칙)
2. [5-Phase 파이프라인 개요](#2-5-phase-파이프라인-개요)
3. [Phase 1: Quick Plan (자동 계획)](#3-phase-1-quick-plan)
4. [Phase 2: MVP Sprint (병렬 실행)](#4-phase-2-mvp-sprint)
5. [Phase 3: Quality Gate (다층 검증)](#5-phase-3-quality-gate)
6. [Phase 4: Fix Loop (적응적 수정)](#6-phase-4-fix-loop)
7. [Phase 5: Finalize (학습 추출)](#7-phase-5-finalize)
8. [에이전트 카탈로그](#8-에이전트-카탈로그)
9. [훅 시스템](#9-훅-시스템)
10. [HITL (인간 개입) 정책](#10-hitl-인간-개입-정책)
11. [공통 패턴 통합](#11-공통-패턴-통합)
12. [상태 관리 및 진행 추적](#12-상태-관리-및-진행-추적)
13. [비용 모델 및 제한 정책](#13-비용-모델-및-제한-정책)
14. [검증 방법](#14-검증-방법)

---

## 1. 설계 목표와 원칙

### 1.1 목표

UAM은 OMC, hoyeon, SG-Loop 세 시스템의 강점을 **하나의 파이프라인**으로 결합한다.

| 목표 | 측정 기준 | 출처 |
|------|----------|------|
| MVP 빠른 생산 | Phase 2에서 비차단 TODO 병렬 실행 | OMC ultrawork |
| 완벽한 테스트 | Phase 3에서 Docker pytest + 멀티모델 리뷰 통과 | SG-Loop + hoyeon |
| 인간 개입 최소화 | Phase 1 HITL 1회 + Phase 4 자동 체크 | 사용자 요구사항 |
| 방향성 이슈 시 루프 체크 | Phase 4 매 루프마다 방향 확인 기회 | 사용자 요구사항 |
| 공통 요소 무조건 포함 | 7개 패턴 전부 반영 (§11 참조) | 3자 비교 분석 |
| 하이브리드 결합 | 각 Phase에서 최적 시스템 패턴 채택 | 통합 설계 |

### 1.2 설계 원칙

**원칙 1: 오케스트레이터-워커 분리** (3개 시스템 공통)
> 오케스트레이터는 **절대** 코드를 작성하지 않는다. 위임과 검증만 수행한다.
- OMC: CLAUDE.md 위임 규칙 + delegation-audit.jsonl
- hoyeon: `disallowed-tools: [Task]` (worker), PreToolUse 쓰기 가드
- SG-Loop: 외부 오케스트레이터가 코드 작성 주체(Claude CLI 세션)와 분리
- **UAM 적용**: PreToolUse 훅으로 하드 강제 (hoyeon 방식)

**원칙 2: 계획 선행** (3개 시스템 공통)
> 실행 전에 반드시 계획을 수립하고, 계획이 진실의 원천(SSOT)이 된다.
- OMC: planner → .omc/plans/
- hoyeon: /specify → PLAN.md
- SG-Loop: Phase 1 → plan.json + test_conditions.json
- **UAM 적용**: Quick Plan으로 자동 PLAN.md 생성, 체크박스가 SSOT (hoyeon 방식)

**원칙 3: 테스트 기반 검증** (3개 시스템 공통)
> 주관적 "완료" 주장 대신 객관적 테스트 통과로 판정한다.
- OMC: verifier + architect 검증
- hoyeon: 3단계 검증 (functional + static + runtime)
- SG-Loop: Docker pytest 100% 통과
- **UAM 적용**: 다층 Quality Gate (§5)

**원칙 4: 재시도 제한** (3개 시스템 공통)
> 무한 루프를 구조적으로 방지하고, 실패 시 적응적으로 대응한다.
- OMC: max_iterations (자동 연장의 약점 인정)
- hoyeon: circuit breaker (3회 → 에스컬레이션)
- SG-Loop: ConvergenceDetector + 하드 리밋
- **UAM 적용**: 적응적 3단계 수정 전략 (§6)

**원칙 5: 지식 축적** (3개 시스템 공통)
> 반복 간 학습을 구조화하여 전달하고, 세션 간 지식을 지속한다.
- OMC: notepad + project-memory + progress.txt
- hoyeon: context/ 디렉토리 (learnings/decisions/issues) + /compound
- SG-Loop: 구조화된 failure_summary
- **UAM 적용**: 4파일 분리 + project-memory (§12)

---

## 2. 5-Phase 파이프라인 개요

```
Phase 1: Quick Plan ─── 자동 계획, HITL 1회
    │
    ▼
Phase 2: MVP Sprint ─── 병렬 실행, 빠른 구현
    │
    ▼
Phase 3: Quality Gate ── Docker 테스트 + 멀티모델 리뷰
    │
    ├── 전체 통과 → Phase 5
    │
    ▼ (실패 시)
Phase 4: Fix Loop ───── 적응적 수정, 루프마다 방향 체크
    │
    ├── 통과 → Phase 5
    ├── 계속 → Phase 4 (루프)
    └── 구조적 실패 → Phase 1 (재계획)
    │
    ▼
Phase 5: Finalize ───── 학습 추출 + 메모리 업데이트
```

### Phase 전환 규칙

| 전환 | 조건 | 출처 |
|------|------|------|
| 1 → 2 | PLAN.md 생성 완료 + HITL 승인 (또는 30초 타임아웃 자동 진행) | hoyeon /specify + 사용자 요구 |
| 2 → 3 | 모든 비차단 TODO 구현 완료 (PLAN.md 체크박스 기준) | hoyeon /execute |
| 3 → 5 | Quality Gate 3개 게이트 전체 통과 | SG-Loop + hoyeon |
| 3 → 4 | 1개 이상 게이트 실패 | SG-Loop |
| 4 → 3 | 수정 후 재검증 요청 | SG-Loop 반복 루프 |
| 4 → 1 | 구조적 실패 (circuit breaker 발동) | hoyeon /bugfix |
| 4 → 5 | Quality Gate 재통과 | 통합 |

---

## 3. Phase 1: Quick Plan

> **출처**: hoyeon /specify (간소화) + OMC explore
>
> 핵심 차별점: hoyeon의 9개 HITL 체크포인트를 **1회로 간소화**하여 속도와 방향성 확인의 균형을 달성한다.

### 3.1 실행 흐름

```
사용자 요청 입력
    │
    ▼
[Step 1] 병렬 탐색 (3개 에이전트 동시)
    ├── explore (Haiku) ──── 코드베이스 구조 + 패턴 파악
    ├── gap-analyzer (Haiku) ── 누락 요구사항, AI 함정, "하지 말 것" 식별
    └── 기존 context/ 및 project-memory 로드
    │
    ▼
[Step 2] 병렬 분석 (3개 에이전트 동시)
    ├── gap-analyzer (Haiku) ──────── Gap Analysis Report
    ├── tradeoff-analyzer (Sonnet) ── 변경사항별 위험도 평가 (LOW/MED/HIGH)
    └── verification-planner (Sonnet) ── A/S/H-items 분류 + 테스트 전략
    │
    ▼
[Step 3] PLAN.md 자동 생성
    ├── TODOs (체크박스 형식, 의존성 그래프 포함)
    ├── 테스트 조건 (A-items: 자동, S-items: 샌드박스, H-items: 인간)
    ├── 위험도 태깅 (LOW/MED/HIGH + Reversible/Irreversible)
    └── 비차단 TODO 식별 (병렬 실행 대상)
    │
    ▼
[Step 4] HITL 1회: 방향성 확인
    ├── "이 계획으로 진행할까요?" (AskUserQuestion)
    ├── 응답 대기 (30초)
    ├── 응답 있음 → 반영 후 Phase 2
    └── 응답 없음 → 자동 진행 (최소 개입 원칙)
```

### 3.2 PLAN.md 구조

```markdown
# PLAN: {feature-name}

## Summary
{1-2문장 요약}

## Risk Assessment
- Overall: {LOW|MED|HIGH}
- Irreversible changes: {있음/없음, 상세}

## TODOs

### [ ] TODO 1: {제목}
- Description: {상세 설명}
- Dependencies: none
- Risk: LOW
- Estimated complexity: {S|M|L}
- Acceptance Criteria:
  - [A] `npm test -- --grep "auth"` passes
  - [A] `tsc --noEmit` clean
  - [S] 로그인 플로우 Agent-as-User 검증
  - [H] UX 일관성 인간 확인

### [ ] TODO 2: {제목}
- Dependencies: TODO-1
- ...

## Test Strategy
### A-items (Agent-Verifiable)
{Tier 1-3 자동 테스트 목록}

### S-items (Sandbox Agent Testing)
{Tier 4 Agent-as-User 시나리오}

### H-items (Human-Required)
{인간 확인 필요 항목}

## Dependency Graph
TODO-1 → TODO-2 → TODO-4
TODO-1 → TODO-3 → TODO-4
```

> **A/S/H-items 3분류** (hoyeon verification-planner 출처):
> - **A-items**: `npm test`, `tsc --noEmit`, `eslint` 등 exit code 기반 자동 검증
> - **S-items**: Docker 샌드박스 내 Agent-as-User 시나리오 검증 (BDD/Gherkin)
> - **H-items**: UX 품질, 비즈니스 로직, 보안 등 인간 판단 필요 항목

### 3.3 에이전트 출력 스키마 강제

hoyeon의 `validate_prompt` 패턴을 적용한다. 각 분석 에이전트는 YAML 프론트매터에 출력 스키마를 정의하고, PostToolUse 훅이 자동으로 검증한다.

**gap-analyzer validate_prompt 예시**:
```yaml
validate_prompt: |
  Must contain 4 sections:
  1. Missing Requirements — 누락된 요구사항
  2. AI Pitfalls — AI 에이전트가 빠지기 쉬운 함정
  3. Must NOT Do — 하지 말아야 할 것
  4. Recommended Questions — 사용자에게 물어야 할 질문
```

**verification-planner validate_prompt 예시**:
```yaml
validate_prompt: |
  Must contain 6 sections:
  1. Test Infrastructure — Tier 1~4별 있음/없음 + 도구/경로
  2. A-items — Agent-Verifiable, Tier 1-3
  3. S-items — Sandbox Agent Testing, Tier 4
  4. H-items — Human-Required 항목
  5. Verification Gaps — 환경 제약 및 대안
  6. External Dependencies — 외부 의존성별 전략
```

---

## 4. Phase 2: MVP Sprint

> **출처**: OMC ultrawork 병렬화 + hoyeon Orchestrator-Worker 패턴
>
> 핵심 차별점: 빠른 MVP 생산을 위해 비차단 TODO를 **병렬 실행**하고, Worker 에이전트의 경계를 **하드 강제**한다.

### 4.1 실행 흐름

```
PLAN.md 로드
    │
    ▼
[Step 1] TODO 파싱 + 의존성 그래프 구축
    ├── 체크박스 상태 파싱
    ├── Dependencies 필드로 DAG 생성
    └── 비차단 TODO 식별 (dependencies: none 또는 모든 선행 완료)
    │
    ▼
[Step 2] 비차단 TODO 병렬 디스패치
    ├── TODO-1 → worker (Sonnet) ─── Task(prompt="TODO-1 구현...")
    ├── TODO-3 → worker (Sonnet) ─── Task(prompt="TODO-3 구현...")
    └── (의존성 있는 TODO는 선행 완료 후 디스패치)
    │
    ▼
[Step 3] Worker 완료 → 검증 → 커밋 (각 TODO별)
    ├── Worker JSON 출력 수신
    ├── A-items 독립 재실행 (Verify Worker)
    │   ├── functional: `npm test`
    │   ├── static: `tsc --noEmit`
    │   └── runtime: `eslint --quiet`
    ├── 통과 → git-master 원자적 커밋
    ├── 실패 → reconciliation (최대 3회, DAG append-only)
    └── PLAN.md 체크박스 업데이트: `### [x] TODO N:`
    │
    ▼
[Step 4] 모든 TODO 완료 → Phase 3
```

### 4.2 Worker 에이전트 규칙

**경계 강제** (hoyeon 출처):
- `disallowed-tools: [Task]` — Worker는 다른 에이전트를 호출할 수 없다
- PreToolUse(Edit/Write) 훅으로 오케스트레이터의 직접 코드 작성을 차단

**Worker JSON 출력 스키마** (hoyeon 출처):
```json
{
  "outputs": {
    "files_changed": ["src/auth.ts", "src/auth.test.ts"],
    "summary": "JWT 검증 로직 구현 + 단위 테스트 추가"
  },
  "acceptance_criteria": [
    {
      "id": "AC-1",
      "category": "functional",
      "command": "npm test -- --grep 'JWT'",
      "status": "PASS"
    },
    {
      "id": "AC-2",
      "category": "static",
      "command": "tsc --noEmit",
      "status": "PASS"
    }
  ],
  "learnings": ["Express의 미들웨어 순서가 인증에 영향"],
  "issues": [],
  "decisions": ["HS256 대신 RS256 선택 — 키 로테이션 용이"]
}
```

> **Verify Worker**: 오케스트레이터가 Worker의 `acceptance_criteria.command`를 **독립적으로 재실행**한다. Worker가 허위 PASS를 보고해도 Verify 단계에서 포착된다 (hoyeon 패턴).

### 4.3 모델 라우팅

OMC의 3-tier 모델 라우팅을 적용한다.

| 작업 | 모델 | 근거 |
|------|------|------|
| TODO 구현 (표준) | Sonnet | 비용-품질 균형 |
| TODO 구현 (복잡, 아키텍처 변경) | Opus | 높은 추론 능력 필요 |
| 로컬 검증 (lint, type check) | — | Bash 직접 실행 |
| 커밋 메시지 생성 | Haiku | 경량 작업 |

### 4.4 재시도 정책 (DAG append-only)

hoyeon의 DAG append-only 원칙을 채택한다.

- 완료된 TODO는 **재실행하지 않는다**
- 검증 실패 시 새 태스크 인스턴스를 생성한다: `Fix:TODO-1:attempt-2`
- 최대 3회 reconciliation 후 Phase 3으로 진행 (잔여 실패는 Phase 4에서 처리)

---

## 5. Phase 3: Quality Gate

> **출처**: SG-Loop Docker 테스트 + hoyeon 멀티모델 리뷰
>
> 핵심 차별점: **3개 게이트**를 순차 적용하여 다층 검증을 수행한다. 하나라도 실패하면 Phase 4로 진입한다.

### 5.1 게이트 구조

```
Gate 1: Docker 샌드박스 pytest (A-items)
    │
    ├── PASS → Gate 2
    └── FAIL → Phase 4 (실패 정보 포함)
    │
    ▼
Gate 2: 멀티모델 코드 리뷰
    │
    ├── SHIP → Gate 3
    └── NEEDS_FIXES → Phase 4 (리뷰 피드백 포함)
    │
    ▼
Gate 3: Agent-as-User 검증 (S-items, 선택적)
    │
    ├── PASS → Phase 5
    └── FAIL → Phase 4 (시나리오 실패 정보 포함)
```

### 5.2 Gate 1: Docker 샌드박스 pytest

SG-Loop의 Docker 격리 테스트를 적용한다. 에이전트는 테스트 실행에 **관여하지 않는다** — 오케스트레이터가 직접 실행하고 판정한다.

```
Docker 컨테이너 시작
    ├── 에이전트 코드를 읽기 전용 마운트 (/app/src:ro)
    ├── 사전 정의된 테스트 스위트 실행
    ├── 결과 JSON 리포트 수집
    └── 컨테이너 제거
```

**테스트 실행 순서** (Fast-Fail 전략):
1. Unit tests (빠름, 첫 관문)
2. Integration tests (중간, Unit 통과 시만)
3. E2E tests (느림, Integration 통과 시만)

**판정 기준**:
- A-items 100% 통과 → Gate 1 PASS
- 1개 이상 실패 → Gate 1 FAIL + 구조화된 실패 요약 생성

**구조화된 실패 요약** (SG-Loop 출처, 500자 이내):
```
Gate 1 Results: 18/25 passed (72%)

Failed tests:
  - test_api_update: KeyError — 'user_id' missing in payload
  - test_api_delete: PermissionError — admin check bypassed
  - ...

Error categories: KeyError(3), PermissionError(2), TypeError(2)
```

### 5.3 Gate 2: 멀티모델 코드 리뷰

hoyeon의 code-reviewer 패턴을 적용한다. 독립적인 모델들이 동일한 diff를 검토하고 합의를 도출한다.

**실행 방식**:
```
멀티모델 병렬 리뷰 (단일 메시지에 Bash 호출 포함, 포그라운드 병렬)
    ├── Codex CLI: `codex exec "Review this diff for..."`
    ├── Gemini CLI: `gemini "Review this diff for..."`
    └── Claude 자체 리뷰
         │
         ▼
    합의 종합
    ├── 만장일치 > 다수결(2/3) > 분열
    ├── ANY critical 발견 → NEEDS_FIXES 강제
    └── SHIP (critical=0 AND warning≤2) / NEEDS_FIXES
```

**8개 검토 카테고리** (hoyeon 출처):
1. Side Effect Investigation
2. Design Impact
3. Structural Improvement
4. API Contract Changes
5. Integration Issues
6. Hidden Bugs
7. Security Concerns
8. Production Readiness

**Graceful Degradation 3상태** (hoyeon 출처):
- `SKIPPED`: CLI 미설치 (which 실패) — claude-only 리뷰로 폴백
- `DEGRADED`: 호출 실패/타임아웃 — claude-only 리뷰로 폴백
- `SHIP/NEEDS_FIXES`: 정상 리뷰 결과

> **핵심**: SKIPPED과 SHIP의 구분이 중요하다. 두 상태를 구분하지 않으면 "리뷰 통과"와 "리뷰 미실시"를 혼동하여 허위 신뢰를 생성한다.

### 5.4 Gate 3: Agent-as-User 검증 (선택적)

PLAN.md에 S-items이 정의된 경우에만 실행한다. hoyeon의 Tier 4 Agent Sandbox 아키텍처를 적용한다.

```
BDD/Gherkin .feature 파일 로드
    │
    ▼
Orchestrator Agent
    ├── 시나리오 파싱
    ├── Persona 에이전트 디스패치
    │   ├── User Agent (브라우저 접근성 트리 제어)
    │   └── Admin Agent (DB assertion, 로그 검사, SELECT only)
    ├── 결과 수집 (N회 실행, 80% 이상 통과 시 PASS)
    └── 판정
```

**비결정성 관리**:
- 시나리오별 3-5회 실행, 80% 이상 통과 시 PASS
- 시나리오당 API 호출 수 상한으로 비용 제어
- 리그레션 가치 있는 발견은 Tier 3 E2E 테스트로 추출 (결정론적 폴백)

---

## 6. Phase 4: Fix Loop

> **출처**: 3개 시스템의 실패 처리 전략 하이브리드
>
> 핵심 차별점: **적응적 3단계 수정 전략** — 실패 패턴에 따라 수정 접근법을 자동으로 전환한다. **매 루프마다 방향 체크** 기회를 제공한다.

### 6.1 적응적 수정 전략

```
실패 유형 분류
    │
    ├── [단순 실패] 1-2개 테스트 실패, 새로운 에러
    │   └── 즉시 수정 (OMC 방식)
    │       - 같은 세션에서 worker가 targeted fix
    │       - 로컬 A-items 재검증
    │       - → Phase 3 재진입
    │
    ├── [반복 실패] 같은 에러가 3회 연속 반복
    │   └── 세션 초기화 + deferred fix (SG-Loop 방식)
    │       - 현재 세션 종료
    │       - 구조화된 실패 요약 생성 (500자 이내)
    │       - 새 세션에서 클린 시작
    │       - "다른 접근법" 명시적 지시
    │       - → Phase 3 재진입
    │
    └── [구조적 실패] 다수 테스트 실패 또는 pass rate 하락
        └── Circuit breaker → Phase 1 재계획 (hoyeon 방식)
            - PLAN.md의 관련 TODO를 FAILED로 마킹
            - 실패 컨텍스트를 bugfix-attempts.md에 보존
            - Phase 1 재진입 (재계획)
```

### 6.2 분류 기준

| 분류 | 조건 | 수정 전략 | 출처 |
|------|------|----------|------|
| 단순 실패 | 실패 테스트 ≤ 2개 AND 이전 루프와 다른 에러 | 즉시 수정 (같은 세션) | OMC Ralph |
| 반복 실패 | 동일 에러 3회 연속 (test name + error type 기준) | 세션 초기화 + deferred fix | SG-Loop |
| 구조적 실패 | 실패 테스트 > 50% OR pass rate 10%+ 하락 OR 동일 에러 세션 초기화 후 2회 추가 정체 | Circuit breaker → Phase 1 | hoyeon /bugfix |

### 6.3 ConvergenceDetector

SG-Loop의 진전 감지 메커니즘을 적용한다.

```
매 Fix Loop 반복 후:
    ├── pass rate 추이 계산 (최근 3회)
    ├── 정체 감지: 최근 3회 pass rate 변화 < 5%
    │   └── 분류: 반복 실패 → 세션 초기화
    ├── 발산 감지: pass rate 10%+ 하락
    │   └── 분류: 구조적 실패 → circuit breaker
    └── 진전 중: pass rate 개선 중
        └── 계속 진행
```

### 6.4 루프마다 방향 체크 (HITL)

사용자 요구사항에 따라 매 Fix Loop 반복마다 방향 전환 기회를 제공한다.

```
Fix Loop 반복 N 완료
    │
    ▼
자동 메시지 생성:
  "N번째 수정 루프. 테스트 통과율 X% (이전 대비 +Y%).
   실패 테스트: {목록}.
   계속 진행할까요?"
    │
    ├── 응답 "계속" 또는 무응답 (30초) → 자동 계속
    ├── 응답 "방향 변경" → Phase 1 재진입
    └── 응답 "중단" → 현재 상태로 종료 (Phase 5)
```

> **최소 개입 원칙**: 응답이 없으면 자동으로 계속 진행한다. 인간은 필요할 때만 개입한다.

### 6.5 비용 제한 정책

SG-Loop의 비용 제한 메커니즘을 적용한다.

| 제한 | 기본값 | 초과 시 |
|------|--------|---------|
| Fix Loop 최대 반복 | 10회 | Phase 5 (부분 완료로 종료) |
| 총 토큰 예산 | 500K tokens | 경고 후 Phase 5 |
| 반복당 토큰 상한 | 80K tokens | 해당 반복 중단, 다음 반복 시도 |

---

## 7. Phase 5: Finalize

> **출처**: hoyeon /compound + OMC project-memory
>
> 핵심 차별점: 학습을 구조화하여 **4개 파일**로 분리 저장하고, project-memory를 업데이트한다.

### 7.1 실행 흐름

```
[Step 1] 학습 추출
    ├── 전체 Phase에서 수집된 learnings 통합
    ├── decisions 통합 (설계 결정 + 근거)
    ├── issues 통합 (미해결 문제)
    └── docs/learnings/{feature-name}/ 에 저장

[Step 2] context/ 디렉토리 정리
    ├── 완료된 TODO의 outputs.json 아카이빙
    ├── 임시 파일 정리
    └── PLAN.md 최종 상태 보존

[Step 3] project-memory 업데이트
    ├── 새로 발견된 codebase patterns 추가
    ├── 기술 결정 기록
    └── 반복 간 전달할 교훈 저장

[Step 4] 원자적 커밋 (git-master)
    ├── 프로젝트 스타일 자동 감지 (언어, 형식)
    ├── 3+ 파일 → 2+ 커밋 필수 (hoyeon 하드 룰)
    └── 의미 단위별 분리 커밋
```

### 7.2 학습 파일 구조

hoyeon의 context/ 패턴을 확장한다.

```
docs/learnings/{feature-name}/
├── learnings.md    # 패턴, 컨벤션 (해결된 것) — "이렇게 동작한다"
├── decisions.md    # 설계 결정 + 근거 — "왜 이렇게 결정했는가"
├── issues.md       # 미해결 문제 — "이 문제가 존재한다"
└── metrics.md      # Phase 3-4 통과율 추이, 비용, 반복 횟수
```

> **learnings vs issues 구분** (hoyeon 출처): learnings는 다음 작업에 도움이 되는 해결된 지식이다. issues는 미해결 문제로, 주의가 필요하다. 이 구분을 Worker JSON 출력에서 강제한다.

---

## 8. 에이전트 카탈로그

### 8.1 필수 에이전트 (9개)

3개 시스템에서 역할별로 최소 필수 에이전트를 선별한다. 비용 절감을 위해 hoyeon의 plan-reviewer(Opus)와 OMC의 architect는 생략하고, 멀티모델 code-reviewer가 계획/코드 양면 검증을 대체한다.

| # | 역할 | 모델 | Phase | 출처 | 핵심 기능 |
|---|------|------|-------|------|----------|
| 1 | **explore** | Haiku | 1 | OMC | 코드베이스 구조 탐색, 파일/심볼 매핑 |
| 2 | **gap-analyzer** | Haiku | 1 | hoyeon | 누락 요구사항, AI 함정, Must NOT Do 식별 |
| 3 | **tradeoff-analyzer** | Sonnet | 1 | hoyeon | 위험도 LOW/MED/HIGH, Reversible/Irreversible 평가 |
| 4 | **verification-planner** | Sonnet | 1 | hoyeon | A/S/H-items 3분류, 4-Tier 테스트 전략 수립 |
| 5 | **worker** | Sonnet | 2, 4 | hoyeon | TODO 구현, JSON 스키마 출력 강제 |
| 6 | **git-master** | Sonnet | 2, 5 | hoyeon/OMC | 원자적 커밋, 스타일 감지, 3+ 파일 → 2+ 커밋 |
| 7 | **code-reviewer** | Sonnet | 3 | hoyeon | 멀티모델 교차 리뷰 오케스트레이션 |
| 8 | **judge** | (로직) | 3 | SG-Loop | Docker pytest 결과 판정, 실패 요약 생성 |
| 9 | **debugger** | Sonnet | 4 | hoyeon | 역방향 콜스택 추적, Bug Type/Severity 분류 |

### 8.2 에이전트별 도구 접근 제한

hoyeon의 `disallowed-tools` 패턴을 적용하여 에이전트 경계를 하드 강제한다.

| 에이전트 | 허용 도구 | 금지 도구 | 근거 |
|---------|----------|----------|------|
| explore | Read, Glob, Grep, Bash(읽기) | Write, Edit, Task | 읽기 전용 탐색 |
| gap-analyzer | Read, Glob, Grep | Write, Edit, Bash, Task | 읽기 전용 분석 |
| tradeoff-analyzer | Read, Glob, Grep | Write, Edit, Bash, Task | 읽기 전용 분석 |
| verification-planner | Read, Glob, Grep | Write, Edit, Bash, Task | 읽기 전용 분석 |
| worker | Read, Glob, Grep, Write, Edit, Bash | **Task** | 단독 구현만, 위임 불가 |
| git-master | Read, Glob, Grep, Bash | Write, Edit, Task | Git 명령만 실행 |
| code-reviewer | Read, Glob, Grep, Bash | Write, Edit | 리뷰만, 수정 불가 |
| judge | (오케스트레이터 내부 로직) | — | 외부 로직, 에이전트 아님 |
| debugger | Read, Glob, Grep, Bash(읽기) | **Write, Edit, Task** | 조사만, 수정 불가 |

### 8.3 모델 라우팅 가이드

| 작업 복잡도 | 모델 | 비용/1M tokens | 사용 시점 |
|-----------|------|---------------|----------|
| 간단한 조회/탐색 | Haiku | 최저 | explore, gap-analyzer, 커밋 메시지 |
| 표준 구현/리뷰 | Sonnet | 중간 | worker, code-reviewer, debugger |
| 복잡한 추론/아키텍처 | Opus | 최고 | 구조적 실패 재계획, 복잡한 TODO |

---

## 9. 훅 시스템

### 9.1 훅 목록

4개 훅으로 핵심 강제 메커니즘을 구현한다.

| # | 훅 | 이벤트 | 역할 | 출처 |
|---|-----|--------|------|------|
| 1 | **PreToolUse(Edit/Write)** | 오케스트레이터가 Edit/Write 호출 시 | 쓰기 가드 — Worker 경계 강제 | hoyeon |
| 2 | **PostToolUse(Task)** | 에이전트 Task 완료 시 | validate_prompt 출력 스키마 검증 | hoyeon |
| 3 | **Stop** | Claude 턴 종료 시 | 루프 지속 + Phase 전환 트리거 | OMC + hoyeon |
| 4 | **UserPromptSubmit** | 사용자 입력 시 | UAM 모드 활성화 키워드 감지 | OMC |

### 9.2 훅 상세

#### 훅 1: PreToolUse 쓰기 가드

```bash
#!/bin/bash
# uam-write-guard.sh
# 오케스트레이터가 직접 코드를 작성하는 것을 차단

TOOL_NAME="$1"       # Edit 또는 Write
FILE_PATH="$2"       # 대상 파일 경로

# 허용 경로: 설정/상태 파일만
ALLOWED_PATTERNS=(
  "PLAN.md"
  ".uam/"
  ".omc/"
  ".claude/"
  "docs/learnings/"
)

for pattern in "${ALLOWED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo '{"allow": true}'
    exit 0
  fi
done

# 소스 코드 파일은 Worker에게 위임해야 함
echo '{"allow": false, "message": "Source files must be edited by worker agents, not the orchestrator. Delegate via Task tool."}'
exit 0
```

#### 훅 2: PostToolUse validate_prompt 검증

```bash
#!/bin/bash
# uam-validate-output.sh
# 에이전트 완료 시 출력 스키마 검증 트리거

AGENT_TYPE="$1"      # subagent_type (예: gap-analyzer)
AGENT_OUTPUT="$2"    # 에이전트 출력 텍스트

# 에이전트 정의 파일에서 validate_prompt 파싱
AGENT_DEF=".claude/agents/${AGENT_TYPE}.md"
if [ ! -f "$AGENT_DEF" ]; then
  exit 0  # 정의 파일 없으면 스킵
fi

VALIDATE_PROMPT=$(grep -A 100 'validate_prompt:' "$AGENT_DEF" | head -20)
if [ -z "$VALIDATE_PROMPT" ]; then
  exit 0  # validate_prompt 없으면 스킵
fi

# Claude에게 검증 리마인더 출력
echo "{\"message\": \"[VALIDATION REMINDER] Verify agent output matches schema: ${VALIDATE_PROMPT}\"}"
```

> **주의** (hoyeon lessons-learned 출처): `validate_prompt` 키 오타(예: `validation_prompt`)는 훅이 조용히 검증을 건너뛰게 한다. 프론트매터 린터를 통해 사전 방지해야 한다.

#### 훅 3: Stop 훅 — Phase 전환

```bash
#!/bin/bash
# uam-phase-controller.sh
# Phase 상태에 따라 루프 지속 또는 Phase 전환

STATE_FILE=".uam/state.json"
CURRENT_PHASE=$(jq -r '.current_phase' "$STATE_FILE")

case "$CURRENT_PHASE" in
  "phase2-sprint")
    # PLAN.md 체크박스 상태 확인
    TOTAL=$(grep -c '### \[' PLAN.md)
    DONE=$(grep -c '### \[x\]' PLAN.md)
    if [ "$DONE" -eq "$TOTAL" ]; then
      echo '{"continue": true, "message": "[UAM] All TODOs complete. Transitioning to Phase 3: Quality Gate."}'
      jq '.current_phase = "phase3-gate"' "$STATE_FILE" > tmp && mv tmp "$STATE_FILE"
    else
      echo '{"continue": true, "message": "[UAM] Sprint in progress. '"$DONE"'/'"$TOTAL"' TODOs complete."}'
    fi
    ;;
  "phase4-fix")
    # Fix Loop 상태 확인
    FIX_COUNT=$(jq -r '.fix_loop_count' "$STATE_FILE")
    MAX_FIX=$(jq -r '.max_fix_loops' "$STATE_FILE")
    if [ "$FIX_COUNT" -ge "$MAX_FIX" ]; then
      echo '{"continue": true, "message": "[UAM] Fix loop limit reached. Transitioning to Phase 5: Finalize."}'
      jq '.current_phase = "phase5-finalize"' "$STATE_FILE" > tmp && mv tmp "$STATE_FILE"
    else
      echo '{"continue": true, "message": "[UAM] Fix loop '"$FIX_COUNT"'/'"$MAX_FIX"'. Continuing."}'
    fi
    ;;
  *)
    echo '{"continue": true}'
    ;;
esac
```

---

## 10. HITL (인간 개입) 정책

### 10.1 개입 시점 총괄

| Phase | 시점 | 유형 | 필수 여부 | 타임아웃 |
|-------|------|------|----------|---------|
| 1 | 계획 완료 후 | 방향성 확인 | **필수** | 30초 → 자동 진행 |
| 2 | — | — | — | — (완전 자율) |
| 3 | — | — | — | — (완전 자율) |
| 4 | 매 루프 반복 후 | 방향 전환 기회 | 선택 | 30초 → 자동 계속 |
| 5 | H-items 존재 시 | 인간 확인 항목 | 필수 (H-items만) | 없음 (대기) |

### 10.2 Phase 1 HITL 상세

```
[AskUserQuestion]
질문: "다음 계획으로 진행할까요?"
옵션:
  1. "진행" — Phase 2로 이동
  2. "수정 필요" — 피드백 제공 후 계획 수정
  3. "재계획" — Phase 1 처음부터
타임아웃: 30초 → 옵션 1 자동 선택
```

### 10.3 Phase 4 HITL 상세

```
[AskUserQuestion]
질문: "{N}번째 수정 루프. 테스트 통과율 {X}% (이전 대비 {+Y}%). 계속 진행할까요?"
옵션:
  1. "계속" — Fix Loop 계속
  2. "방향 변경" — Phase 1 재진입
  3. "현재 상태로 종료" — Phase 5 (부분 완료)
타임아웃: 30초 → 옵션 1 자동 선택
```

### 10.4 설계 근거

| 설계 결정 | 근거 |
|----------|------|
| Phase 1 HITL 필수 | 잘못된 방향으로 전체 파이프라인 실행하는 것은 비용 낭비. hoyeon의 9개 HITL에서 가장 중요한 1개만 선별 |
| Phase 4 HITL 선택적 | 사용자 요구사항 "방향성 이슈 시 루프마다 체크". 그러나 매번 강제하면 자율성 저하 |
| 30초 타임아웃 | 최소 개입 원칙. SG-Loop의 완전 자율 + hoyeon의 구조화된 HITL의 중간 지점 |

---

## 11. 공통 패턴 통합

3개 시스템에서 **모두** 존재하는 7개 공통 패턴과 UAM에서의 적용 방식을 정의한다.

### 11.1 공통 패턴 매핑

| # | 공통 패턴 | OMC | hoyeon | SG-Loop | UAM 적용 |
|---|----------|-----|--------|---------|---------|
| 1 | 오케스트레이터-워커 분리 | executor 위임 + CLAUDE.md 소프트 규칙 | worker 위임 + disallowed-tools 하드 강제 | CLI 세션 위임 + 외부 오케스트레이터 | **PreToolUse 훅 하드 강제** (hoyeon) + 외부 판정 (SG-Loop) |
| 2 | 계획 선행 | planner → .omc/plans/ | /specify → PLAN.md | Phase 1 → plan.json | **Quick Plan → PLAN.md** (체크박스 SSOT) |
| 3 | 테스트 기반 검증 | verifier + architect | 3단계 (functional+static+runtime) | Docker pytest | **다층 Quality Gate** (Docker + 멀티모델 + Agent-as-User) |
| 4 | 재시도 제한 | max_iterations (자동 연장) | circuit breaker (3회 → 에스컬레이션) | ConvergenceDetector + 하드 리밋 | **적응적 3단계** (즉시 수정 → 세션 초기화 → circuit breaker) |
| 5 | 지식 축적 | notepad + project-memory + progress.txt | context/ (learnings/decisions/issues) + /compound | 구조화된 failure_summary | **4파일 분리** (learnings/decisions/issues/metrics) + project-memory |
| 6 | 에이전트 전문화 | 28+ agents (3-tier) | 15 agents (목적 특화) | 최소 agents (1 CLI 세션) | **9개 필수 에이전트** (역할별 최소, 3-tier 라우팅) |
| 7 | 진행 추적 | progress.txt append-only | PLAN.md 체크박스 | test_results_history JSON | **PLAN.md 체크박스 SSOT** + metrics.json |

### 11.2 각 패턴의 강제 수준

```
소프트 강제                     하이브리드                     하드 강제
(유연, 위반 가능)              (선택적 강제)                 (위반 불가)
    │                            │                            │
    OMC                         UAM                        SG-Loop
    │                            │                            │
 CLAUDE.md 지침          PreToolUse 가드 (하드)        외부 오케스트레이터
 경고 + 감사 로그        validate_prompt (자동)        Docker 격리
 continue:true 항상      적응적 3단계 수정             하드 리밋
                         HITL 선택적 개입              세션 초기화
```

> **UAM의 위치**: 소프트-하드 스펙트럼의 중간. 핵심 경계(쓰기 가드, 출력 검증)는 하드 강제하되, 실행 전략과 HITL은 적응적으로 조절한다.

---

## 12. 상태 관리 및 진행 추적

### 12.1 디렉토리 구조

```
.uam/
├── state.json                  # 파이프라인 상태 (current_phase, fix_loop_count, ...)
├── PLAN.md                     # Phase 1 산출물 (체크박스 = SSOT)
├── config.json                 # UAM 설정 (모델 라우팅, 비용 제한, ...)
├── context/
│   ├── learnings.md            # 해결된 패턴/컨벤션
│   ├── decisions.md            # 설계 결정 + 근거
│   ├── issues.md               # 미해결 문제
│   └── outputs.json            # Worker 실행 결과 누적
├── gate-results/
│   ├── gate1-docker.json       # Gate 1 Docker pytest 결과
│   ├── gate2-review.json       # Gate 2 멀티모델 리뷰 결과
│   └── gate3-agent-user.json   # Gate 3 Agent-as-User 결과
├── fix-loop/
│   ├── iteration-001/
│   │   ├── failure_summary.txt # 실패 요약 (500자 이내)
│   │   ├── verdict.json        # 판정 결과
│   │   └── metrics.json        # 토큰, 시간, pass rate
│   └── iteration-002/
│       └── ...
├── sandbox/
│   ├── Dockerfile              # Docker 테스트 환경
│   ├── test_fixtures/          # Seed 데이터
│   └── test_suite/             # 사전 정의 테스트
└── bugfix-attempts.md          # Circuit breaker 발동 시 시도 내용 보존
```

### 12.2 state.json 스키마

```json
{
  "pipeline_id": "uam-20260228-auth-feature",
  "current_phase": "phase2-sprint",
  "started_at": "2026-02-28T10:00:00Z",
  "plan_approved": true,
  "plan_approved_at": "2026-02-28T10:02:30Z",
  "sprint_status": {
    "total_todos": 5,
    "completed_todos": 3,
    "in_progress_todos": 1,
    "failed_todos": 0
  },
  "gate_results": {
    "gate1_passed": null,
    "gate2_passed": null,
    "gate3_passed": null
  },
  "fix_loop_count": 0,
  "max_fix_loops": 10,
  "cost": {
    "total_tokens": 45000,
    "max_total_tokens": 500000,
    "estimated_usd": 0.45
  },
  "convergence": {
    "pass_rate_history": [],
    "stagnation_window": 3,
    "min_improvement": 0.05,
    "regression_threshold": -0.10
  }
}
```

### 12.3 PLAN.md를 SSOT로

hoyeon의 패턴을 채택: **PLAN.md의 체크박스 상태가 진행의 유일한 진실 원천**이다.

```
### [x] TODO 1: JWT 인증 미들웨어 구현        ← 완료
### [x] TODO 2: 사용자 모델 스키마 정의        ← 완료
### [ ] TODO 3: API 엔드포인트 라우팅          ← 진행 중
### [ ] TODO 4: 에러 핸들링 통합               ← 대기
### [FAILED] TODO 5: WebSocket 인증           ← 실패 (Phase 4에서 처리)
```

상태 전환 규칙:
- `[ ]` → `[x]`: Worker 완료 + Verify 통과 + git commit 성공
- `[ ]` → `[FAILED]`: reconciliation 3회 실패
- `[FAILED]` → `[x]`: Fix Loop에서 수정 성공

---

## 13. 비용 모델 및 제한 정책

### 13.1 Phase별 예상 비용

| Phase | 에이전트 토큰 | 훅 오버헤드 | Docker 비용 | 총 예상 |
|-------|-------------|-----------|-----------|--------|
| Phase 1: Quick Plan | ~15K | ~2K | $0 | ~17K tokens |
| Phase 2: MVP Sprint | ~60K | ~5K | $0 | ~65K tokens |
| Phase 3: Quality Gate | ~20K | ~1K | ~$0.10 | ~21K tokens + $0.10 |
| Phase 4: Fix Loop (5회) | ~50K | ~3K | ~$0.25 | ~53K tokens + $0.25 |
| Phase 5: Finalize | ~10K | ~1K | $0 | ~11K tokens |
| **합계** | **~155K** | **~12K** | **~$0.35** | **~167K tokens + $0.35** |

### 13.2 기존 시스템과의 비교

| 항목 | UAM | OMC Ralph (10회) | hoyeon /execute (10회) | SG-Loop (10회) |
|------|-----|-----------------|---------------------|---------------|
| 에이전트 토큰 | ~155K | ~150K (누적 증가) | ~120K (중간 증가) | ~80K (일정) |
| 훅 오버헤드 | ~12K | ~15K | ~10K | 0 |
| Docker 비용 | ~$0.35 | $0 | $0 | ~$0.50 |
| 총 토큰 | ~167K | ~165K | ~130K | ~80K |

> **분석**: UAM은 OMC와 총 토큰이 유사하지만, Phase 2의 병렬 실행으로 **시간 효율**이 높고, Phase 3-4의 다층 검증으로 **품질**이 높다. Docker 비용은 SG-Loop보다 낮다 (Phase 3-4에서만 사용).

### 13.3 비용 절감 전략

| 전략 | 절감 효과 | 출처 |
|------|----------|------|
| Haiku로 탐색/분석 에이전트 실행 | Phase 1 토큰 40% 절감 | OMC 3-tier |
| 비차단 TODO 병렬 실행 | 시간 50%+ 절감 (토큰은 동일) | OMC ultrawork |
| Docker 이미지 사전 빌드 + 캐싱 | cold start 시간 80% 절감 | SG-Loop/Nebius |
| 구조화된 실패 요약 (500자 이내) | Fix Loop 토큰 60% 절감 (vs 전체 컨텍스트) | SG-Loop |
| Fast-Fail 테스트 전략 | Unit 실패 시 나머지 스킵 → Docker 시간 절감 | SG-Loop |

---

## 14. 검증 방법

### 14.1 문서 구조 검증

본 설계 문서가 3개 시스템의 출처를 정확히 명시하는지 확인한다.

| 섹션 | OMC 출처 | hoyeon 출처 | SG-Loop 출처 |
|------|---------|------------|-------------|
| Phase 1: Quick Plan | explore 에이전트 | /specify 간소화, gap/tradeoff/verification-planner, validate_prompt | — |
| Phase 2: MVP Sprint | ultrawork 병렬화, 3-tier 라우팅 | Orchestrator-Worker 분리, disallowed-tools, PreToolUse 가드, DAG append-only, Worker JSON 스키마 | — |
| Phase 3: Quality Gate | — | 멀티모델 code-reviewer, Graceful Degradation, Agent-as-User (Tier 4) | Docker pytest, Fast-Fail, 구조화된 실패 요약 |
| Phase 4: Fix Loop | Ralph 즉시 수정 | circuit breaker, 에스컬레이션 | 세션 초기화, deferred fix, ConvergenceDetector, 비용 제한 |
| Phase 5: Finalize | project-memory | /compound 학습 추출, context/ 4파일 분리, git-master 원자적 커밋 | — |

### 14.2 공통 요소 체크

7개 공통 패턴의 포함 여부:

- [x] **오케스트레이터-워커 분리**: Phase 2 Worker 규칙, 훅 1 PreToolUse 쓰기 가드
- [x] **계획 선행**: Phase 1 Quick Plan, PLAN.md SSOT
- [x] **테스트 기반 검증**: Phase 3 Quality Gate (Docker + 멀티모델 + Agent-as-User)
- [x] **재시도 제한**: Phase 4 적응적 3단계 (즉시 → 세션초기화 → circuit breaker)
- [x] **지식 축적**: Phase 5 4파일 분리 + project-memory
- [x] **에이전트 전문화**: 9개 필수 에이전트, 3-tier 모델 라우팅
- [x] **진행 추적**: PLAN.md 체크박스 SSOT + metrics.json

### 14.3 사용자 요구사항 충족

| 요구사항 | 충족 여부 | 근거 |
|---------|----------|------|
| MVP 빠른 생산 | ✅ | Phase 2 비차단 TODO 병렬 실행 (OMC ultrawork) |
| 완벽한 테스트 | ✅ | Phase 3 다층 게이트 (Docker + 멀티모델 + Agent-as-User) |
| 인간 개입 최소 | ✅ | Phase 1 HITL 1회 (30초 타임아웃) + Phase 4 선택적 체크 |
| 방향성 이슈 시 루프 체크 | ✅ | Phase 4 매 루프마다 AskUserQuestion (30초 타임아웃) |
| 공통 요소 무조건 포함 | ✅ | 7개 패턴 전부 반영 (§11) |
| 하이브리드 결합 | ✅ | 5-Phase 파이프라인에서 각 Phase별 최적 시스템 채택 |
| 하나의 방법론 | ✅ | UAM 단일 파이프라인으로 통합 |

### 14.4 기존 문서와의 관계

본 문서는 기존 연구 문서를 **참조(cross-reference)**하며, 내용을 중복하지 않는다.

| 참조 문서 | 관계 |
|----------|------|
| `ref_three_system_comparison.md` | 3자 비교 분석의 결과물을 UAM 설계의 입력으로 사용 |
| `ref_hoyeon_sdd_pipeline_analysis.md` | hoyeon 에이전트/훅/워크플로우 상세를 UAM Phase 1-2-5에 적용 |
| `ref_sandbox_gated_iteration_loop.md` | SG-Loop Docker/세션 초기화/ConvergenceDetector를 UAM Phase 3-4에 적용 |
| `ref_ralph_vs_sg_loop_comparison.md` | Ralph vs SG-Loop의 트레이드오프를 Phase 4 적응적 전략의 근거로 사용 |
| `design_sg_loop_and_hybrid.md` | SG-Loop 구현 설계의 컴포넌트(Judge, Sandbox Manager 등)를 UAM Phase 3에 재사용 |

---

## 부록 A: Phase 전환 상태 다이어그램

```
                    ┌──────────────┐
                    │  Phase 1:    │
           ┌──────→│  Quick Plan  │
           │        └──────┬───────┘
           │               │ HITL 승인 (또는 30초 타임아웃)
           │               ▼
           │        ┌──────────────┐
           │        │  Phase 2:    │
           │        │  MVP Sprint  │
           │        └──────┬───────┘
           │               │ 모든 TODO 완료
           │               ▼
           │        ┌──────────────┐
           │   ┌───→│  Phase 3:    │
           │   │    │ Quality Gate │
           │   │    └──┬───────┬───┘
           │   │       │       │
           │   │  전체 통과   실패
           │   │       │       │
           │   │       ▼       ▼
           │   │  ┌────────┐ ┌──────────────┐
           │   │  │Phase 5:│ │  Phase 4:    │
           │   │  │Finalize│ │  Fix Loop    │──── 반복 ──→ Phase 3
           │   │  └────────┘ └──────┬───────┘
           │   │                    │
           │   │               구조적 실패
           │   │              (circuit breaker)
           │   │                    │
           └───┼────────────────────┘
               │
               └── 수정 성공 → Phase 3 재진입
```

## 부록 B: 용어 정의

| 용어 | 정의 | 출처 |
|------|------|------|
| A-items | Agent-Verifiable. exit code 기반 자동 검증 가능한 테스트 항목 | hoyeon |
| S-items | Sandbox Agent Testing. Docker 샌드박스에서 Agent-as-User로 검증하는 항목 | hoyeon |
| H-items | Human-Required. 인간 판단이 필요한 검증 항목 | hoyeon |
| SSOT | Single Source of Truth. 진실의 유일한 원천 | 일반 |
| DAG append-only | 완료된 태스크를 재실행하지 않고 새 인스턴스를 생성하는 원칙 | hoyeon |
| Deferred fix | 실패를 즉시 수정하지 않고 다음 반복으로 미루는 전략 | SG-Loop |
| Circuit breaker | 반복 실패 시 종료 대신 상위 Phase로 에스컬레이션하는 메커니즘 | hoyeon |
| ConvergenceDetector | pass rate 추이 기반 진전 정체/발산을 감지하는 컴포넌트 | SG-Loop |
| validate_prompt | 에이전트 출력 스키마를 YAML 프론트매터로 정의하고 훅으로 강제하는 패턴 | hoyeon |
| Graceful Degradation | 외부 도구 실패 시 SKIPPED/DEGRADED 상태로 폴백하는 패턴 | hoyeon |
| Quick Plan | hoyeon /specify를 간소화한 UAM Phase 1. HITL을 9회에서 1회로 축소 | UAM |
| Quality Gate | SG-Loop Docker 테스트 + hoyeon 멀티모델 리뷰를 결합한 UAM Phase 3 | UAM |
| Fix Loop | 3개 시스템의 실패 처리를 적응적으로 결합한 UAM Phase 4 | UAM |

---

*본 문서는 harness_lab 연구 저장소의 통합 에이전트 방법론 설계로, OMC·hoyeon·SG-Loop 세 시스템의 강점을 하나의 5-Phase 파이프라인으로 결합한다.*
