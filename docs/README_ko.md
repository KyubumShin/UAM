# UAM (Unified Agent Methodology) — Standalone Plugin

Claude Code 전용 **독립형** 에이전트 오케스트레이션 플러그인.
OMC, hoyeon, SG-Loop 세 시스템의 강점을 하나의 5-Phase 파이프라인으로 통합했다.

**외부 의존성 없음** — Claude Code + Node.js 16+만 있으면 동작한다.

---

## 1. 개요

### UAM이란?

UAM은 **Unified Agent Methodology**의 약자로, 세 에이전트 오케스트레이션 시스템의 최고 기능을 결합한 **독립형 플러그인**이다.

| 시스템 | 강점 | UAM에서의 채택 |
|--------|------|----------------|
| **OMC** | 빠른 병렬 실행, 키워드 자동활성화, 상태 대시보드 | Phase 2 병렬화, 키워드 훅, uam-status 스킬 |
| **hoyeon** | 엄격한 Worker 경계, Fat Skill 자기완결성, 서킷 브레이커 | 쓰기 가드 훅, uam-bugfix 스킬, validate_prompt |
| **SG-Loop** | Docker 격리 테스트, 진전 감지, 세션 초기화 | Quality Gate, ConvergenceDetector, 적응적 수정 |

### 독립형 설계

UAM은 외부 프레임워크(OMC, hoyeon 등) 없이 완전히 독립적으로 동작한다:

- **자체 훅 시스템**: 4개 훅이 상태 관리, Phase 전환, 쓰기 가드를 처리
- **자체 상태 관리**: `.uam/state.json`으로 파이프라인 상태 추적
- **자체 스킬셋**: 7개 스킬이 활성화/PP인터뷰/상태/취소/재개/버그수정/학습추출을 커버
- **자체 에이전트**: 12개 전문 에이전트가 Phase별 역할 수행
- **공존 가능**: OMC/hoyeon이 설치되어 있어도 간섭하지 않음 (UAM 비활성 시 훅 패스)

### 설계 원칙 (5가지)

1. **오케스트레이터-워커 분리**: 오케스트레이터는 절대 소스 코드를 직접 작성하지 않는다. 모든 코드 변경은 worker 에이전트에게 위임한다. (PreToolUse 훅으로 하드 강제)

2. **계획 선행**: 실행 전에 반드시 PLAN.md를 작성하고, PLAN.md의 체크박스가 진행의 진실의 원천(SSOT)이 된다.

3. **테스트 기반 검증**: 주관적 "완료" 주장 대신 객관적 테스트 통과로 판정한다.

4. **재시도 제한**: 무한 루프를 방지하기 위해 실패 패턴에 따라 적응적으로 대응한다. (즉시 수정 → 세션 초기화 → circuit breaker)

5. **지식 축적**: 반복 간 학습을 4개 파일(learnings, decisions, issues, metrics)로 구조화하여 보존한다.

---

## 2. 빠른 시작

### 활성화 방법

#### 방법 1: 키워드 자동활성화 (권장)
사용자 입력에 `uam` 키워드를 포함하면 자동 활성화된다:
```
"uam으로 이 기능을 만들어 줘"
```
→ `uam-keyword-detector.mjs` 훅이 자동으로 `.uam/state.json` 초기화

#### 방법 2: 스킬 직접 호출
```
/uam:uam               # 전체 5-Phase 파이프라인 활성화
```

#### 방법 3: 커맨드 호출 (상세 프로토콜 참조)
```
/uam:uam-run            # 오케스트레이션 프로토콜 전체 로드
```

### 스킬셋 (8개 스킬 + 2개 커맨드)

UAM은 8개 독립형 스킬로 전체 라이프사이클을 커버한다:

| 스킬 | 호출 | 목적 | 출처 패턴 |
|------|------|------|----------|
| **uam** | `/uam:uam` | 5-Phase 파이프라인 전체 실행 | hoyeon Fat Skill + UAM 상태 머신 |
| **uam-small** | `/uam:uam-small` | 3-Phase 경량 파이프라인 (일상적 기능 추가) | UAM 고유 |
| **uam-pivot** | `/uam:uam-pivot` | Pivot Points 인터뷰 (불변 제약 정의) | UAM 고유 |
| **uam-status** | `/uam:uam-status` | 파이프라인 대시보드 (Phase, TODO, Gate, 수렴) | OMC status-check |
| **uam-cancel** | `/uam:uam-cancel` | 안전한 중단 + 상태 보존 (`--force`로 초기화) | OMC cancel + hoyeon 상태 보존 |
| **uam-resume** | `/uam:uam-resume` | 취소된 파이프라인을 이전 Phase에서 재개 | UAM 고유 |
| **uam-bugfix** | `/uam:uam-bugfix` | 독립형 적응적 버그 수정 (3회 시도 + 서킷 브레이커) | hoyeon /bugfix |
| **uam-compound** | `/uam:uam-compound` | 학습 추출 + 지식 증류 + 프로젝트 메모리 갱신 | hoyeon /compound |

**커맨드**:
- `/uam:uam-run` — Phase 1-5 상세 오케스트레이션 프로토콜 참조 문서
- `/uam:uam-small-run` — Phase 1-3 경량 오케스트레이션 프로토콜 참조 문서

#### 스킬 흐름도

```
/uam:uam-pivot (Pivot Points 인터뷰 — Phase 0)
     │
     ▼
/uam:uam (전체 5-Phase 파이프라인)
 ├── /uam:uam-status     (진행 확인, 언제든 호출 가능)
 ├── /uam:uam-cancel     (중단 → 상태 보존)
 │    └── /uam:uam-resume (보존된 상태에서 재개)
 └── /uam:uam-compound   (완료/취소 후 학습 추출)

/uam:uam-small (경량 3-Phase 파이프라인)
 ├── /uam:uam-status     (진행 확인, 언제든 호출 가능)
 ├── /uam:uam-cancel     (중단 → 상태 보존)
 │    └── /uam:uam-resume (보존된 상태에서 재개)
 └── /uam:uam-compound   (완료/취소 후 학습 추출)

/uam:uam-bugfix (독립 모드 — 파이프라인 밖에서 단독 사용)
 └── 3회 실패 시 → /uam:uam (전체 파이프라인으로 전환 제안)
```

#### Auto-Routing (자동 파이프라인 선택)

키워드 감지 훅이 사용자 입력을 분석하여 적절한 파이프라인을 자동 선택한다:

| 키워드 패턴 | 파이프라인 | Phases | 토큰 예산 | 적합한 작업 |
|------------|----------|--------|----------|-----------|
| `uam bugfix` | Bugfix | Fix only | ~30K | 단일 버그 수정 |
| `uam small`, `uam quick`, `uam light` | **Small** | 3 | ~70K | 일상적 기능 추가 (1-5파일) |
| `uam` | Full | 5 | ~167K | 복잡한 기능, 리팩토링 |

#### Pivot Points + Discovery 흐름

```
Phase 0: PP 인터뷰 → .uam/pivot-points.md (불변 제약)
Phase 1: PM이 PP 포함한 PLAN.md 생성
Phase 2: Worker가 Discovery 제안 → PP 충돌 검사
  ├── CONFIRMED PP 충돌 → 자동 반려
  ├── PROVISIONAL PP 충돌 → HITL 판단
  └── 충돌 없음 → maturity_mode에 따라 반영
```

### 파이프라인 흐름

```
Phase 1: Quick Plan
  ↓ (PLAN.md 생성, HITL 1회)
Phase 2: MVP Sprint
  ↓ (비차단 TODO 병렬 구현)
Phase 3: Quality Gate
  ├→ 전체 통과: Phase 5
  └→ 실패: Phase 4
Phase 4: Fix Loop
  ├→ 통과: Phase 3 재진입
  ├→ 구조적 실패: Phase 1 재진입
  └→ 루프 제한 도달: Phase 5
Phase 5: Finalize
  (학습 추출, 메모리 업데이트, 커밋)
```

### 핵심 개념 (3가지)

- **PLAN.md**: 체크박스가 진행 상태의 유일한 출처. `[ ]` (미완료), `[x]` (완료), `[FAILED]` (실패)
- **A/S/H-items**: 검증 전략의 3분류
  - **A-items**: Agent-Verifiable (자동 명령으로 검증 가능)
  - **S-items**: Sandbox Agent Testing (Agent-as-User로 검증)
  - **H-items**: Human-Required (인간 판단 필요)
- **Worker**: 오직 하나의 TODO만 구현하고, Task 도구(다른 에이전트 호출)는 사용 불가

---

## 3. 5-Phase 파이프라인 상세

### Phase 1: Quick Plan (자동 계획)

**목표**: 실행 전에 방향성 확인 + 검증 전략 수립

**흐름**:

```
[Step 1] 병렬 탐색 (4-6개 에이전트, 동시 실행)
  ├── explore (Haiku) ──────────── 코드베이스 구조, 패턴, 테스트 인프라 파악
  ├── gap-analyzer (Haiku) ─────── 누락 요구사항, AI 함정, Must NOT Do 식별
  ├── pm (Opus) ────────────────── 요구사항 정제, 사용자 스토리, MoSCoW 우선순위
  ├── verification-planner (Sonnet) ── A/S/H-items 분류 + 4-Tier 테스트 전략
  ├── researcher (Sonnet) [선택] ── 기술 조사, 라이브러리 비교 (새 기술 도입 시)
  └── designer (Sonnet) [선택] ─── UX/UI 설계, 컴포넌트 구조 (UI 작업 시)

[Step 2] 분석 (1개 에이전트)
  └── tradeoff-analyzer (Sonnet) ── 변경사항별 위험도 평가 (LOW/MED/HIGH)

[Step 3] 계획 자동 생성
  └── PLAN.md 작성 (체크박스 형식, 의존성 그래프, 위험도 태깅)

[Step 4] HITL 1회: 방향성 확인
  └── AskUserQuestion "이 계획으로 진행할까요?"
      ├── "진행" → Phase 2
      ├── "수정 필요" → 피드백 반영 후 PLAN.md 수정
      └── "재계획" → Phase 1 처음부터
      (30초 타임아웃 → 자동 진행)
```

**산출물**: `.uam/PLAN.md`
```markdown
# PLAN: {feature-name}

## Summary
{1-2문장 요약}

## Risk Assessment
- Overall: {LOW|MED|HIGH}
- Irreversible changes: {상세}

## TODOs

### [ ] TODO 1: {제목}
- Description: {설명}
- Dependencies: none
- Risk: LOW
- Estimated complexity: S|M|L
- Acceptance Criteria:
  - [A] `npm test -- --grep "pattern"` passes
  - [S] 로그인 플로우 Agent-as-User 검증
  - [H] UX 일관성 인간 확인

### [ ] TODO 2: ...
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

### Phase 2: MVP Sprint (병렬 실행)

**목표**: 비차단 TODO를 병렬로 빠르게 구현

**흐름**:

```
[Step 1] 의존성 그래프 분석
  └── PLAN.md의 Dependencies 필드로 DAG 구성
      비차동 TODO 식별 (dependencies: none 또는 모든 선행 완료)

[Step 2] 비차단 TODO 병렬 디스패치
  ├── TODO-1 → worker-1 (Sonnet)
  ├── TODO-3 → worker-2 (Sonnet)
  └── (의존성 있는 TODO는 선행 완료 후 디스패치)

[Step 3] Worker 완료 → 검증 → 커밋 (각 TODO별)
  ├── Worker JSON 출력 수신
  ├── A-items 독립 재실행 (Verify Worker)
  │   ├── functional: `npm test`
  │   ├── static: `tsc --noEmit`
  │   └── runtime: `eslint --quiet`
  ├── 통과 → git-master 원자적 커밋
  ├── 실패 → reconciliation (최대 3회, DAG append-only)
  └── PLAN.md 체크박스 업데이트: `### [x] TODO N:`

[Step 4] 모든 TODO 완료 → Phase 3 자동 진입
  (Stop 훅이 PLAN.md 체크박스 상태 감시)
```

**Worker 규칙** (hoyeon 출처):

| 규칙 | 상세 |
|------|------|
| disallowedTools | Task (다른 에이전트 호출 불가) |
| 위임 불가 | 모든 코드 변경은 자신이 직접 수행 |
| 스코프 제한 | 할당된 TODO만 구현, 인접 파일 수정 금지 |
| 출력 검증 | JSON 스키마 강제 (PostToolUse 훅 검증) |

**Worker 출력 스키마** (필수):

```json
{
  "todo_id": "TODO-1",
  "status": "PASS|FAIL|PARTIAL",
  "outputs": {
    "files_changed": ["src/auth.ts"],
    "summary": "JWT 인증 미들웨어 구현"
  },
  "acceptance_criteria": [
    {
      "id": "AC-1",
      "category": "functional",
      "command": "npm test -- --grep 'JWT'",
      "expected_exit": 0,
      "actual_exit": 0,
      "status": "PASS",
      "output_snippet": "..."
    }
  ],
  "learnings": ["패턴 또는 컨벤션"],
  "issues": ["문제점"],
  "decisions": ["설계 결정 + 근거"]
}
```

### Phase 3: Quality Gate (다층 검증)

**목표**: 3개 게이트를 순차 통과하여 품질 확보

**구조**:

```
Gate 1: Docker pytest (A-items 자동 테스트)
  ├── PASS → Gate 2
  └── FAIL → Phase 4

Gate 2: 멀티모델 코드 리뷰
  ├── SHIP → Gate 3
  └── NEEDS_FIXES → Phase 4

Gate 3: Agent-as-User (S-items, 선택적)
  ├── PASS → Phase 5
  └── FAIL → Phase 4
```

#### Gate 1: Docker pytest

오케스트레이터가 직접 실행 (에이전트 개입 없음):
- Docker 컨테이너 시작
- A-items 테스트 실행 (Unit → Integration → E2E, Fast-Fail)
- 결과 JSON 리포트 수집
- Judge 로직으로 판정

**판정 기준**:
- 100% A-items 통과 → PASS
- 1개 이상 실패 → FAIL + 구조화된 실패 요약 (500자 이내)

**구조화된 실패 요약 예시**:
```
Gate 1 Results: 18/25 passed (72%)

Failed tests:
  - test_api_update: KeyError — 'user_id' missing in payload
  - test_api_delete: PermissionError — admin check bypassed

Error categories: KeyError(3), PermissionError(2), TypeError(2)
```

#### Gate 2: 멀티모델 코드 리뷰

`uam-code-reviewer` 에이전트가 8개 카테고리로 독립 검토:
1. Side Effect Investigation
2. Design Impact
3. Structural Improvement
4. API Contract Changes
5. Integration Issues
6. Hidden Bugs
7. Security Concerns
8. Production Readiness

**Graceful Degradation** (CLI 미설치 시):
- `SKIPPED`: Codex/Gemini CLI 미설치 (which 실패)
- `DEGRADED`: CLI 호출 실패/타임아웃
- `SHIP/NEEDS_FIXES`: 정상 리뷰 결과

> **주의**: SKIPPED와 SHIP을 구분해야 한다. 둘을 혼동하면 "리뷰 통과"와 "리뷰 미실시"를 구분할 수 없다.

**판정**:
- `SHIP` (critical=0, warning≤2) → PASS
- `NEEDS_FIXES` (critical>0) → FAIL

#### Gate 3: Agent-as-User (선택적)

PLAN.md에 S-items이 정의된 경우에만 실행:
- BDD/Gherkin 시나리오로 정의
- 각 시나리오 3-5회 실행
- 80% 이상 통과 시 PASS

### Phase 4: Fix Loop (적응적 수정)

**목표**: 실패를 분류하고 적응적으로 대응

**3단계 수정 전략**:

| 분류 | 조건 | 전략 | 출처 |
|------|------|------|------|
| **단순 실패** | 실패 테스트 ≤2개, 새로운 에러 | 즉시 수정 (같은 세션, worker 대상 fix) | OMC Ralph |
| **반복 실패** | 동일 에러 3회 연속 | 세션 초기화 (새 세션, "다른 접근법" 명시) | SG-Loop |
| **구조적 실패** | 실패 테스트 >50% 또는 pass rate 10%+ 하락 | Circuit breaker (Phase 1 재계획) | hoyeon |

**ConvergenceDetector 로직**:

```
매 Fix Loop 반복 후:
  ├── pass rate 추이 계산 (최근 3회)
  ├── 정체 감지: variance < 5%
  │   └── 분류: 반복 실패 → 세션 초기화
  ├── 발산 감지: pass rate 10%+ 하락
  │   └── 분류: 구조적 실패 → circuit breaker
  └── 진전 중: pass rate 개선 중
      └── 계속 진행
```

**매 루프마다 방향 체크** (HITL, 선택적):

```
AskUserQuestion: "{N}번째 수정 루프. 테스트 통과율 {X}%. 계속 진행할까요?"

Options:
  1. "계속" → Fix Loop 계속
  2. "방향 변경" → Phase 1 재진입
  3. "현재 상태로 종료" → Phase 5 (부분 완료)

(30초 타임아웃 → 자동으로 "계속" 선택)
```

**비용 제한**:

| 제한 | 기본값 | 초과 시 |
|------|--------|---------|
| Fix Loop 최대 반복 | 10회 | Phase 5 (부분 완료로 종료) |
| 총 토큰 예산 | 500K tokens | 경고 후 Phase 5 |
| 반복당 토큰 상한 | 80K tokens | 해당 반복 중단, 다음 반복 시도 |

### Phase 5: Finalize (학습 추출)

**목표**: 지식 축적 및 최종 커밋

**흐름**:

```
[Step 1] 학습 추출
  └── docs/learnings/{feature-name}/ 생성:
      ├── learnings.md ─── 해결된 패턴/컨벤션
      ├── decisions.md ─── 설계 결정 + 근거
      ├── issues.md ─────── 미해결 문제
      └── metrics.md ────── Phase 3-4 통과율, 반복 횟수, 토큰 사용량

[Step 2] project-memory 업데이트
  └── 새로운 codebase 패턴, 기술 결정, 교훈 저장

[Step 3] 원자적 커밋 (git-master)
  ├── 프로젝트 스타일 자동 감지
  ├── 3+ 파일 → 2+ 커밋 필수 (의미 단위별 분리)
  └── 각 커밋에 변경 사항 및 이유 명시

[Step 4] 완료 리포트
  └── 요약:
      - TODOs 완료/실패 현황
      - Gate 통과율
      - Fix Loop 반복 횟수
      - 핵심 학습 사항
      - 남은 이슈 (있을 경우)

State: current_phase = "completed" → UAM 비활성화
```

---

## 4. 에이전트 카탈로그

### 12개 에이전트 + Judge

| # | 이름 | 기본 모델 | 금지 도구 | Phase | 핵심 역할 |
|---|------|----------|----------|-------|----------|
| 1 | `uam-explore` | Haiku | Write, Edit, Task | 1 | 코드베이스 구조 탐색, 파일/심볼 매핑 |
| 2 | `uam-gap-analyzer` | Haiku | Write, Edit, Bash, Task | 1 | 누락 요구사항, AI 함정, Must NOT Do 식별 |
| 3 | `uam-tradeoff-analyzer` | Sonnet | Write, Edit, Bash, Task | 1 | 변경사항별 위험도 평가 (LOW/MED/HIGH) |
| 4 | `uam-verification-planner` | Sonnet | Write, Edit, Bash, Task | 1 | A/S/H-items 3분류, 4-Tier 테스트 전략 |
| 5 | `uam-pm` | **Opus** | Write, Edit, Bash, Task | 1 | 요구사항 정제, 사용자 스토리, MoSCoW 우선순위 |
| 6 | `uam-designer` | Sonnet | Write, Edit, Bash, Task | 1 | UX/UI 설계, 컴포넌트 구조, 접근성 |
| 7 | `uam-researcher` | Sonnet | Write, Edit, Task | 1 | 기술 조사, 선행 사례, 라이브러리 평가 |
| 8 | `uam-worker` | Sonnet | **Task** | 2, 4 | TODO 구현 (범용), JSON 스키마 출력 강제 |
| 9 | `uam-frontend` | Sonnet | **Task** | 2, 4 | 프론트엔드 구현 (UI/CSS/컴포넌트/접근성) |
| 10 | `uam-git-master` | Sonnet | Write, Edit, Task | 2, 5 | 원자적 커밋, 스타일 감지, 3+ 파일 → 2+ 커밋 |
| 11 | `uam-code-reviewer` | Sonnet | Write, Edit | 3 | 멀티모델 교차 리뷰, 8개 카테고리 검증 |
| 12 | `uam-debugger` | Sonnet | Write, Edit, Task | 4 | 역방향 콜스택 추적, Bug Type/Severity 분류 |
| — | **Judge** | (로직) | — | 3 | Docker pytest 결과 판정, 실패 요약 생성 |

**Judge는 에이전트가 아니다**: 오케스트레이터 내부 로직으로, 테스트 결과를 객관적으로 판정한다.

### 에이전트 분류

```
Phase 1 (분석/계획): explore, gap-analyzer, tradeoff-analyzer,
                     verification-planner, pm, designer, researcher
  └─ 필수: explore, gap-analyzer, pm, verification-planner
  └─ 선택: researcher (새 기술 도입 시), designer (UI 작업 시)

Phase 2 (구현):      worker (범용), frontend (UI), git-master (커밋)
  └─ worker vs frontend: TODO 키워드로 자동 선택

Phase 3 (검증):      code-reviewer + Judge 로직

Phase 4 (수정):      worker/frontend (수정) + debugger (진단)
```

### 모델 라우팅 전략 (Dynamic Escalation)

에이전트 파일의 `model:`은 기본값이다. 오케스트레이터가 Task 호출 시 `model` 파라미터로 상향할 수 있다.

| 작업 복잡도 | 모델 | 사용 시점 |
|-----------|------|----------|
| 간단한 조회/탐색 | Haiku | explore, gap-analyzer |
| 표준 구현/리뷰 | Sonnet | worker, frontend, code-reviewer, debugger |
| 방향성/요구사항 정제 | **Opus (기본)** | pm |
| 복잡한 추론 (상향) | **Opus** | 모호한 요구사항, 아키텍처 변경, 3회+ 반복 실패 |

**Phase별 상향 시점**:
- Phase 1: 요구사항이 모호하거나 시스템 전체에 영향 → pm, tradeoff-analyzer를 opus로
- Phase 2: TODO 복잡도 L + 아키텍처 변경 → worker를 opus로
- Phase 3: 보안/API 호환성이 중요한 리뷰 → code-reviewer를 opus로
- Phase 4: 3회 반복 실패 (stagnation) → debugger를 opus로

---

## 5. 훅 시스템

### 4개 훅 목록

| # | 훅 | 이벤트 | 역할 | 강제 수준 |
|---|-----|--------|------|----------|
| 1 | `uam-write-guard.mjs` | PreToolUse (Edit/Write) | 소스 파일 쓰기 차단 | **하드 강제** |
| 2 | `uam-validate-output.mjs` | PostToolUse (Task) | 에이전트 출력 스키마 검증 리마인더 | 자동 |
| 3 | `uam-phase-controller.mjs` | Stop | Phase 전환 + 루프 지속 | 상태 제어 |
| 4 | `uam-keyword-detector.mjs` | UserPromptSubmit | "uam" 키워드 감지 + 상태 초기화 | 활성화 |

### 훅 1: PreToolUse 쓰기 가드

**목표**: 오케스트레이터의 직접 코드 작성을 원천 차단

**동작**:
```
Edit/Write 호출 시:
  ├── UAM 활성 여부 확인
  │   └── 비활성 → 통과 (기존 워크플로 간섭 없음)
  │
  ├── 파일 경로 검증
  │   ├── 허용 경로 (.uam/, .omc/, .claude/, PLAN.md, docs/learnings/) → 통과
  │   ├── 소스 파일 (.ts, .py, .js, ...) → BLOCK
  │   └── 기타 파일 → 통과
  │
  └── 위반 시: 하드 블록 (operation 진행 안 됨)
      메시지: "Source files must be edited by uam-worker agents"
```

**허용 경로**:
- `.uam/` — 상태, 계획, 학습 파일
- `.omc/` — OMC 호환성
- `.claude/` — 설정
- `PLAN.md` — 체크박스 관리
- `docs/learnings/` — 학습 아카이빙

**금지 도구**: Task 도구로 worker에게 위임하도록 강제

### 훅 2: PostToolUse 검증 리마인더

**목표**: 에이전트 출력 스키마 검증 자동화

**동작**:
```
Task 완료 후:
  ├── 에이전트 정의 파일 읽기 (.claude/agents/{agent}.md)
  ├── validate_prompt 섹션 파싱
  ├── 출력이 스키마와 일치하는지 확인
  └── 불일치 시: 검증 리마인더 메시지 출력
```

**예시**:
- `gap-analyzer`: 4개 섹션 필수 (Missing Requirements, AI Pitfalls, Must NOT Do, Recommended Questions)
- `verification-planner`: 6개 섹션 필수 (Test Infrastructure, A-items, S-items, H-items, Verification Gaps, External Dependencies)
- `uam-worker`: JSON 스키마 (todo_id, status, outputs, acceptance_criteria, learnings, issues, decisions)

> **주의**: `validate_prompt` 키 오타(예: `validation_prompt`)는 훅이 조용히 검증을 건너뛰게 한다.

### 훅 3: Stop 훅 — Phase 전환

**목표**: Phase 상태에 따라 루프 지속 또는 Phase 전환

**동작**:
```
Stop 이벤트 (Claude 턴 종료) 시:
  │
  ├── phase1-plan
  │   └── (오케스트레이터 수동 진행, 자동 전환 없음)
  │
  ├── phase2-sprint
  │   ├── PLAN.md 파싱: 체크박스 상태 확인
  │   ├── 남은 TODO > 0 → 메시지 출력, continue: true
  │   └── 남은 TODO = 0 → phase3-gate로 전환, continue: true
  │
  ├── phase3-gate
  │   ├── gate1_passed, gate2_passed, gate3_passed 상태 확인
  │   ├── 전체 통과 → phase5-finalize로 전환
  │   ├── 1개 이상 실패 → phase4-fix로 전환
  │   └── 평가 중 → 메시지 출력, continue: true
  │
  ├── phase4-fix
  │   ├── fix_loop_count < max_fix_loops (10) → continue: true
  │   └── fix_loop_count >= 10 → phase5-finalize로 전환
  │
  └── phase5-finalize
      └── current_phase = "completed" → continue: false (UAM 종료)
```

### 훅 4: UserPromptSubmit 키워드 감지

**목표**: "uam" 키워드 자동 감지 + UAM 상태 초기화

**동작**:
```
사용자 입력 시:
  ├── "uam" 키워드 포함 여부 확인
  ├── 포함 → .uam/state.json 초기화
  │   ├── pipeline_id 생성 (날짜-기능명)
  │   ├── current_phase = "phase1-plan"
  │   ├── started_at = 현재 시각
  │   └── 기타 필드 기본값으로 설정
  └── 미포함 → 무시 (기존 워크플로 간섭 없음)
```

---

## 6. 상태 관리

### 디렉토리 구조

```
.uam/
├── state.json                  # 파이프라인 상태 (JSON)
├── PLAN.md                     # Phase 1 산출물 (체크박스 = SSOT)
├── config.json                 # UAM 설정 (모델 라우팅, 비용 제한)
│
├── context/
│   ├── learnings.md            # 해결된 패턴/컨벤션
│   ├── decisions.md            # 설계 결정 + 근거
│   ├── issues.md               # 미해결 문제
│   └── outputs.json            # Worker 실행 결과 누적
│
├── gate-results/
│   ├── gate1-docker.json       # Gate 1 Docker pytest 결과
│   ├── gate2-review.json       # Gate 2 멀티모델 리뷰 결과
│   └── gate3-agent-user.json   # Gate 3 Agent-as-User 결과
│
├── fix-loop/
│   ├── iteration-001/
│   │   ├── failure_summary.txt # 실패 요약 (500자 이내)
│   │   ├── verdict.json        # 판정 결과
│   │   └── metrics.json        # 토큰, 시간, pass rate
│   └── iteration-002/
│       └── ...
│
├── sandbox/
│   ├── Dockerfile              # Docker 테스트 환경
│   ├── test_fixtures/          # Seed 데이터
│   └── test_suite/             # 사전 정의 테스트
│
└── bugfix-attempts.md          # Circuit breaker 발동 시 시도 내용 보존
```

### state.json 스키마

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

### PLAN.md SSOT 원칙

**PLAN.md의 체크박스가 진행의 유일한 진실 원천**:

```markdown
### [ ] TODO 1: JWT 인증 미들웨어 구현      ← 미완료
### [x] TODO 2: 사용자 모델 스키마 정의      ← 완료
### [ ] TODO 3: API 엔드포인트 라우팅       ← 진행 중
### [FAILED] TODO 4: WebSocket 인증        ← 실패 (Phase 4에서 처리)
```

**상태 전환**:
- `[ ]` → `[x]`: Worker 완료 + Verify 통과 + git commit 성공
- `[ ]` → `[FAILED]`: reconciliation 3회 실패
- `[FAILED]` → `[x]`: Fix Loop에서 수정 성공

---

## 7. 핵심 원칙

### 원칙 1: 오케스트레이터-워커 분리 (하드 강제)

오케스트레이터는 절대 소스 코드를 직접 작성하지 않는다.

- **PreToolUse 훅**: Edit/Write를 소스 파일에 대해 차단
- **Worker 위임**: Task 도구로 worker 에이전트에게 위임
- **경계 강제**: worker는 Task 도구 사용 불가 (다른 에이전트 호출 불가)

### 원칙 2: 테스트 기반 검증

주관적 "완료" 주장 대신 객관적 테스트 통과로 판정한다.

- **Phase 2**: A-items 독립 재실행 (Verify Worker)
- **Phase 3**: Docker pytest 100% 통과 필수
- **Phase 4**: 실패 패턴 자동 분류 (ConvergenceDetector)

### 원칙 3: 재시도 제한

무한 루프를 방지하기 위해 적응적으로 대응한다.

| 패턴 | 전략 |
|------|------|
| 단순 실패 (≤2개 테스트) | 즉시 수정 |
| 반복 실패 (동일 에러 3회) | 세션 초기화 |
| 구조적 실패 (>50% 실패) | Circuit breaker → Phase 1 |

### 원칙 4: 지식 축적

반복 간 학습을 구조화하여 전달한다.

```
Phase 2, 4: Worker 실행 결과 수집
  → learnings (패턴)
  → decisions (설계 결정)
  → issues (문제점)

Phase 5: 4개 파일로 분리 저장
  ├── docs/learnings/{feature}/learnings.md
  ├── docs/learnings/{feature}/decisions.md
  ├── docs/learnings/{feature}/issues.md
  └── docs/learnings/{feature}/metrics.md

project-memory 업데이트
  → 다음 세션에서 자동 로드
```

### 원칙 5: 최소 개입 (HITL)

인간 개입은 최소화하되, 중요한 결정에서는 권한을 남긴다.

| Phase | 시점 | 필수 여부 | 타임아웃 |
|-------|------|----------|---------|
| 1 | 계획 완료 후 | **필수** | 30초 → 자동 진행 |
| 2 | — | — | (완전 자율) |
| 3 | — | — | (완전 자율) |
| 4 | 매 루프 반복 후 | 선택 | 30초 → 자동 계속 |
| 5 | H-items 존재 시 | 필수 (H-items만) | 없음 (대기) |

---

## 8. 파일 구조

```
harness_lab/UAM/

.claude-plugin/
└── plugin.json                     # 플러그인 매니페스트

agents/                              # 12개 에이전트
├── uam-explore.md                  # Phase 1: 코드베이스 탐색 (haiku)
├── uam-gap-analyzer.md             # Phase 1: 누락 요구사항 식별 (haiku)
├── uam-tradeoff-analyzer.md        # Phase 1: 위험도 평가 (sonnet)
├── uam-verification-planner.md     # Phase 1: A/S/H 분류 + 테스트 전략 (sonnet)
├── uam-pm.md                       # Phase 1: 요구사항 정제, 우선순위 (opus)
├── uam-designer.md                 # Phase 1: UX/UI 설계, 접근성 (sonnet)
├── uam-researcher.md               # Phase 1: 기술 조사, 라이브러리 평가 (sonnet)
├── uam-worker.md                   # Phase 2, 4: TODO 구현 (sonnet)
├── uam-frontend.md                 # Phase 2, 4: 프론트엔드 구현 (sonnet)
├── uam-git-master.md               # Phase 2, 5: 원자적 커밋 (sonnet)
├── uam-code-reviewer.md            # Phase 3: 멀티모델 리뷰 (sonnet)
└── uam-debugger.md                 # Phase 4: 디버깅 (sonnet)

hooks/                               # 4개 훅 + 유틸
├── hooks.json                      # 훅 등록 (settings.json 대체)
├── lib/
│   ├── uam-state.mjs               # 상태 읽기/쓰기 유틸
│   └── stdin.mjs                    # stdin JSON 리더
├── uam-write-guard.mjs             # PreToolUse: 쓰기 가드
├── uam-validate-output.mjs         # PostToolUse: 출력 검증
├── uam-phase-controller.mjs        # Stop: Phase 전환
└── uam-keyword-detector.mjs        # UserPromptSubmit: 키워드 감지

commands/                            # 2개 커맨드
├── uam-run.md                      # UAM 5-Phase 오케스트레이션 프로토콜
└── uam-small-run.md                # UAM 3-Phase 경량 오케스트레이션 프로토콜

skills/                              # 8개 스킬 (디렉토리/SKILL.md 규격)
├── uam/SKILL.md                    # 전체 5-Phase 파이프라인 활성화
├── uam-small/SKILL.md              # 경량 3-Phase 파이프라인 활성화
├── uam-pivot/SKILL.md              # Phase 0: Pivot Points 인터뷰
├── uam-status/SKILL.md             # 파이프라인 대시보드
├── uam-cancel/SKILL.md             # 안전한 중단 + 상태 보존
├── uam-resume/SKILL.md             # 이전 Phase에서 재개
├── uam-bugfix/SKILL.md             # 독립형 적응적 버그 수정
└── uam-compound/SKILL.md           # 학습 추출 + 지식 증류

docs/
└── design_unified_agent_methodology.md  # 전체 설계 사양

README.md                          # 본 문서
```

---

## 9. 설계 문서 참조

**전체 사양**: [`docs/design_unified_agent_methodology.md`](/Users/kbshin/project/harness_lab/docs/design_unified_agent_methodology.md)

본 README는 요약본이다. 상세한 내용은 설계 문서를 참조하라:

- **§1**: 설계 목표와 원칙 (5가지)
- **§2-7**: Phase별 상세 (Quick Plan, MVP Sprint, Quality Gate, Fix Loop, Finalize)
- **§8**: 에이전트 카탈로그 (12개 + Judge)
- **§9**: 훅 시스템 (4개)
- **§10**: HITL 정책 (인간 개입)
- **§11**: 공통 패턴 통합 (7가지)
- **§12**: 상태 관리 (디렉토리, state.json, PLAN.md SSOT)
- **§13**: 비용 모델 (Phase별 토큰 추정)
- **§14**: 검증 방법 (구조 검증, 공통 요소 체크)

---

## 10. 검증 방법

### 구조 검증

**훅 정상 작동 확인**:

```bash
# 1. settings.json에서 훅 등록 확인
grep -A 20 '"hooks"' .claude/settings.json

# 2. 훅 파일 존재 확인
ls -la .claude/hooks/uam-*.mjs

# 3. 상태 유틸 존재 확인
ls -la .claude/hooks/lib/uam-state.mjs
```

**에이전트 정의 확인**:

```bash
# 1. 12개 에이전트 파일 확인
ls -la .claude/agents/uam-*.md

# 2. 7개 스킬 파일 확인
ls -la .claude/skills/uam*.md

# 3. disallowedTools 확인
grep -n "disallowedTools:" .claude/agents/uam-*.md
```

**Phase 전환 테스트**:

```bash
# 1. 상태 파일 초기화
echo '{}' > .uam/state.json

# 2. Phase 1 시작 후 Phase 2 자동 전환 확인
cat .uam/state.json | jq '.current_phase'
# Expected: "phase2-sprint"

# 3. 각 Phase 전환 확인
# Phase 2 → 3: PLAN.md 모든 TODO 완료
# Phase 3 → 4: Gate 1개 이상 실패
# Phase 4 → 5: fix_loop_count >= 10 또는 all gates pass
```

### 공통 패턴 체크

3개 시스템 강점이 모두 UAM에 포함되었는가?

- [ ] **OMC 기여**: Phase 2 비차단 TODO 병렬화, 3-tier 모델 라우팅
- [ ] **hoyeon 기여**: Phase 1 A/S/H 분류, PreToolUse 쓰기 가드, validate_prompt, Worker JSON 스키마
- [ ] **SG-Loop 기여**: Phase 3 Docker pytest, Phase 4 ConvergenceDetector, 적응적 3단계 수정

---

## 11. UAM 비활성화

UAM이 완료되거나 취소되면 자동으로 비활성화된다:

```json
{
  "current_phase": "completed"
}
```

이후 일반 워크플로로 복귀한다. 훅은 UAM 비활성 상태에서 간섭하지 않는다:

```
if (!isUamActive(cwd)) {
  // UAM 비활성: 모든 훅이 pass (continue: true)
  return;
}
```

---

## 12. 설치 및 초기화

### 필수 사항

- Node.js 16+ (`.mjs` 파일 실행)
- `.claude/` 디렉토리 (Claude Code 설정)
- `settings.json` (훅 등록)

### 수동 초기화

```bash
# 1. 디렉토리 생성
mkdir -p .uam/{context,gate-results,fix-loop,sandbox}
mkdir -p docs/learnings

# 2. 상태 파일 초기화 (또는 키워드 자동)
echo '{}' > .uam/state.json

# 3. 훅 활성화 (settings.json 등록되었는지 확인)
cat .claude/settings.json | jq '.hooks'
```

---

## 13. 문제 해결

### 훅이 작동하지 않음

**증상**: Edit/Write 차단 안 됨, Phase 전환 안 됨

**확인 사항**:
1. `settings.json`에 훅 등록 확인
2. 훅 파일 존재 확인 (`.claude/hooks/uam-*.mjs`)
3. Node.js 16+ 설치 확인
4. `.uam/state.json` 파일 존재 확인 (UAM 활성 필수)

### PLAN.md 체크박스 동기화 안 됨

**증상**: Worker 완료했지만 PLAN.md 체크박스 미업데이트

**원인**: 오케스트레이터가 PLAN.md를 수동으로 업데이트해야 함

**해결**:
```bash
# PLAN.md 수동 업데이트
sed -i 's/### \[ \] TODO-1:/### [x] TODO-1:/' PLAN.md
```

### Phase 전환 지연

**증상**: TODO 모두 완료했지만 Phase 3 진입 안 됨

**원인**: Stop 훅이 PLAN.md를 파싱하지 못함 (포맷 불일치)

**확인**:
```bash
# PLAN.md 체크박스 포맷 확인
grep -n '### \[' .uam/PLAN.md
# 올바른 포맷: ### [ ] 또는 ### [x] 또는 ### [FAILED]
```

---

## 14. 용어 정의

| 용어 | 정의 |
|------|------|
| **A-items** | Agent-Verifiable. exit code 기반 자동 검증 가능한 테스트 |
| **S-items** | Sandbox Agent Testing. Docker 샌드박스에서 Agent-as-User로 검증 |
| **H-items** | Human-Required. 인간 판단이 필요한 검증 항목 |
| **SSOT** | Single Source of Truth. 진실의 유일한 원천 (PLAN.md 체크박스) |
| **DAG append-only** | 완료된 작업은 재실행하지 않고 새 인스턴스 생성 |
| **Deferred fix** | 실패를 즉시 수정하지 않고 다음 반복으로 미루는 전략 |
| **Circuit breaker** | 반복 실패 시 상위 Phase로 에스컬레이션 |
| **ConvergenceDetector** | pass rate 추이 기반 진전 정체/발산 감지 |
| **Verify Worker** | 오케스트레이터가 Worker 출력의 acceptance_criteria를 독립 재실행 |
| **Graceful Degradation** | 외부 도구 실패 시 SKIPPED/DEGRADED 상태로 폴백 |

---

## 15. 참고 자료

- **설계 문서**: `docs/design_unified_agent_methodology.md` (1,057줄)
- **참조 문서** (설계 기반):
  - `docs/ref_three_system_comparison.md` — OMC vs hoyeon vs SG-Loop 비교
  - `docs/ref_hoyeon_sdd_pipeline_analysis.md` — hoyeon 상세 분석
  - `docs/ref_sandbox_gated_iteration_loop.md` — SG-Loop 패턴 분석
  - `docs/ref_ralph_vs_sg_loop_comparison.md` — Ralph vs SG-Loop 비교
  - `docs/design_sg_loop_and_hybrid.md` — SG-Loop 구현 설계

---

**UAM은 독립형 에이전트 오케스트레이션 플러그인으로, OMC·hoyeon·SG-Loop 세 시스템의 강점을 하나의 5-Phase 파이프라인으로 결합한다. 외부 의존성 없이 Claude Code + Node.js만으로 동작한다.**
