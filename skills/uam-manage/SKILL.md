---
description: UAM 플러그인 관리 (설치 상태, 업데이트, 제거, 진단)
---

# UAM Manage

설치 상태 확인, 업데이트, 제거, 진단 기능.

## Commands

### status (기본)
- 설치 위치 확인 (global/project)
- 심링크 유효성 검사
- hooks.json 등록 상태
- 에이전트/스킬 수 표시

### update
- git pull로 최신 코드 가져오기
- 심링크는 자동 반영 (재설치 불필요)
- 버전 확인 후 변경 로그 표시

### uninstall
- 심링크 제거
- .uam/ 상태 정리 여부 확인 (AskUserQuestion)

### doctor
- Node.js 버전 확인
- 심링크 유효성
- hooks.json 경로 확인
- 에이전트 파일 존재 확인
- 권한 문제 진단
