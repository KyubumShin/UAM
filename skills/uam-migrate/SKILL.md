---
description: Migrate existing UAM files from .claude/ to UAM/ plugin structure - automated project migration
---

# UAM Migrate

기존 `.claude/` 디렉토리에 흩어진 UAM 파일들을 `UAM/` 독립 플러그인 구조로 자동 마이그레이션한다.

## When to Use

- 기존 프로젝트에서 `.claude/` 기반 UAM을 사용 중일 때
- UAM을 독립 플러그인으로 전환하고 싶을 때
- 새 프로젝트에 UAM 플러그인 구조를 복제하고 싶을 때

## Protocol

### Step 1: 현재 상태 진단

프로젝트 루트에서 UAM 파일 존재 여부를 탐색한다.

```
# 탐색 대상
.claude/agents/uam-*.md          → 에이전트 (12개 expected)
.claude/hooks/uam-*.mjs          → 훅 스크립트 (4개 expected)
.claude/hooks/lib/uam-state.mjs  → 상태 유틸
.claude/hooks/lib/stdin.mjs      → stdin 유틸
.claude/skills/uam*.md           → 스킬 (7개 expected)
.claude/commands/uam-run.md      → 커맨드
.claude/settings.json            → 훅 등록
.claude/README.md                → UAM README
docs/design_unified_agent_methodology.md → 설계 문서
```

각 카테고리별 발견된 파일 수를 카운트하고 보고한다.

```
UAM Migration Scan
━━━━━━━━━━━━━━━━━
Agents:    {N}/12
Hooks:     {N}/4
Hook libs: {N}/2
Skills:    {N}/7
Commands:  {N}/1
README:    {found|missing}
Design doc:{found|missing}
Settings:  {has UAM hooks|no UAM hooks}
```

### Step 2: 기존 UAM/ 충돌 확인

```
if UAM/ directory exists:
  AskUserQuestion: "UAM/ 폴더가 이미 존재합니다. 어떻게 처리할까요?"
  Options:
    1. "덮어쓰기" → 기존 UAM/ 삭제 후 새로 생성
    2. "병합" → 없는 파일만 추가, 기존 파일 유지
    3. "취소" → 마이그레이션 중단
```

### Step 3: 디렉토리 생성

```bash
mkdir -p UAM/.claude-plugin
mkdir -p UAM/hooks/lib
mkdir -p UAM/skills/{uam,uam-pivot,uam-status,uam-cancel,uam-resume,uam-bugfix,uam-compound}
mkdir -p UAM/agents
mkdir -p UAM/commands
mkdir -p UAM/docs
```

### Step 4: 매니페스트 생성

**`UAM/.claude-plugin/plugin.json`** (신규 생성):
```json
{
  "name": "uam",
  "version": "1.0.0",
  "description": "Unified Agent Methodology - 5-Phase autonomous coding pipeline",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json"
}
```

**`UAM/hooks/hooks.json`** — `.claude/settings.json`의 UAM 훅을 `${CLAUDE_PLUGIN_ROOT}` 경로로 변환:
```json
{
  "hooks": {
    "PreToolUse": [{"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/uam-write-guard.mjs\"", "timeout": 3}]}],
    "PostToolUse": [{"matcher": "Task", "hooks": [{"type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/uam-validate-output.mjs\"", "timeout": 3}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/uam-phase-controller.mjs\""}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/uam-keyword-detector.mjs\""}]}]
  }
}
```

### Step 5: 파일 복사 + 변환

#### 5a: 에이전트 (as-is 복사)
```bash
cp .claude/agents/uam-*.md UAM/agents/
```

#### 5b: 훅 스크립트 (1건 수정)
```bash
# 변경 없이 복사
cp .claude/hooks/uam-validate-output.mjs UAM/hooks/
cp .claude/hooks/uam-phase-controller.mjs UAM/hooks/
cp .claude/hooks/uam-keyword-detector.mjs UAM/hooks/
cp .claude/hooks/lib/uam-state.mjs UAM/hooks/lib/
cp .claude/hooks/lib/stdin.mjs UAM/hooks/lib/

# write-guard: ALLOWED_PATTERNS에 /UAM\// 추가
cp .claude/hooks/uam-write-guard.mjs UAM/hooks/
# → ALLOWED_PATTERNS 배열에 /\/UAM\// 패턴 추가
```

`__dirname` 기반 상대 경로이므로 import 경로 변경 불필요.

#### 5c: 스킬 (flat → directory/SKILL.md)
```bash
for skill in uam uam-pivot uam-status uam-cancel uam-resume uam-bugfix uam-compound; do
  cp ".claude/skills/${skill}.md" "UAM/skills/${skill}/SKILL.md"
done
```

#### 5d: 커맨드 + 문서
```bash
cp .claude/commands/uam-run.md UAM/commands/
cp docs/design_unified_agent_methodology.md UAM/docs/  # 복사본 (원본 유지)
cp .claude/README.md UAM/README.md
```

### Step 6: 상호 참조 업데이트

모든 SKILL.md, uam-run.md, README.md, uam-keyword-detector.mjs에서:

| 변경 전 | 변경 후 |
|---------|---------|
| `/project:uam-*` | `/uam:uam-*` |
| `/project:uam` (단독) | `/uam:uam` |

```bash
# 모든 대상 파일에 일괄 치환
sed -i '' 's|/project:uam|/uam:uam|g' UAM/skills/*/SKILL.md UAM/commands/uam-run.md UAM/README.md UAM/hooks/uam-keyword-detector.mjs
```

README.md의 §8 파일 구조 경로도 `UAM/` 기준으로 업데이트한다.

### Step 7: 구 파일 정리

```
AskUserQuestion: "원본 .claude/ 파일을 삭제할까요?"
Options:
  1. "삭제" → UAM 관련 파일 제거, settings.json에서 UAM 훅 제거
  2. "유지" → 원본을 백업으로 남김 (중복 주의)
  3. "백업 후 삭제" → .claude/uam-backup/ 로 이동 후 원본 위치에서 제거
```

삭제 대상:
- `.claude/agents/uam-*.md` (12개)
- `.claude/hooks/uam-*.mjs` (4개)
- `.claude/hooks/lib/uam-state.mjs`, `stdin.mjs` (2개)
- `.claude/skills/uam*.md` (7개)
- `.claude/commands/uam-run.md` (1개)
- `.claude/README.md` (1개)
- `.claude/settings.json` 내 UAM 훅 항목 (비워둠 or 제거)

**유지**: `docs/design_unified_agent_methodology.md` (프로젝트 레벨 연구 문서)

### Step 8: 검증

```bash
# 1. 파일 수 확인
find UAM/ -type f | wc -l  # 30개 expected (추가 스킬 포함 시 +N)

# 2. JSON 유효성
node -e "JSON.parse(require('fs').readFileSync('UAM/.claude-plugin/plugin.json'))"
node -e "JSON.parse(require('fs').readFileSync('UAM/hooks/hooks.json'))"

# 3. 훅 구문
node --check UAM/hooks/uam-*.mjs

# 4. 스킬 frontmatter
for d in UAM/skills/*/; do head -1 "$d/SKILL.md" | grep -q "^---" && echo "OK: $d" || echo "FAIL: $d"; done

# 5. 참조 일관성
grep -r "/project:uam" UAM/  # 0건이어야 함

# 6. 구 파일 제거 확인
ls .claude/agents/uam-* .claude/skills/uam* .claude/hooks/uam-* 2>&1  # 파일 없음
```

### Step 9: 결과 보고

```
UAM Migration Complete
━━━━━━━━━━━━━━━━━━━━━
Source:  .claude/ (old structure)
Target:  UAM/ (plugin structure)

Migrated:
  Agents:    {N} files
  Hooks:     {N} files + {N} libs
  Skills:    {N} skills (flat → directory/SKILL.md)
  Commands:  {N} files
  Docs:      {N} files
  Manifests: 2 files (plugin.json, hooks.json) [NEW]

Changes:
  - Cross-references: /project:uam* → /uam:uam*
  - Write guard: /UAM\// added to ALLOWED_PATTERNS
  - README §8: file paths updated to UAM/ root

Cleanup: {deleted|kept|backed up}

Plugin ready at: UAM/
```

## Edge Cases

| 상황 | 처리 |
|------|------|
| 일부 에이전트만 존재 (< 12) | 있는 것만 복사, 누락 파일 경고 |
| 커스텀 에이전트 (`uam-custom-*.md`) | 패턴 매칭으로 함께 복사 |
| settings.json에 UAM 외 다른 훅 존재 | UAM 훅만 제거, 나머지 유지 |
| `.uam/state.json` 활성 파이프라인 | 경고: "활성 파이프라인이 있습니다. 먼저 `/uam:uam-cancel`로 중단하세요." |
| UAM/ 이미 최신 구조 | "이미 마이그레이션되었습니다." 보고 후 종료 |
| 프로젝트에 UAM 파일 없음 | "UAM 파일을 찾을 수 없습니다." 보고 후 종료 |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/uam:uam` | Full 5-Phase pipeline |
| `/uam:uam-status` | Pipeline status dashboard |
| `/uam:uam-cancel` | Cancel active pipeline |
