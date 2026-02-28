#!/bin/bash
set -euo pipefail

GLOBAL_LINK="$HOME/.claude/plugins/marketplaces/uam"
PROJECT_LINK=".claude/plugins/uam"

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

echo "UAM Plugin Uninstaller"
echo "━━━━━━━━━━━━━━━━━━━━━"

removed=0

if [[ -L "$GLOBAL_LINK" ]]; then
  rm "$GLOBAL_LINK"
  echo -e "${GREEN}✓ Global 심링크 제거: $GLOBAL_LINK${NC}"
  removed=1
fi

if [[ -L "$PROJECT_LINK" ]]; then
  rm "$PROJECT_LINK"
  echo -e "${GREEN}✓ Project 심링크 제거: $PROJECT_LINK${NC}"
  removed=1
fi

# Optional: clean .uam state
if [[ "${1:-}" == "--clean" ]]; then
  if [[ -d ".uam" ]]; then
    rm -rf .uam
    echo -e "${GREEN}✓ .uam/ 상태 디렉토리 제거${NC}"
  fi
fi

if (( removed == 0 )); then
  echo "설치된 UAM 플러그인을 찾을 수 없습니다."
else
  echo ""
  echo -e "${GREEN}제거 완료. Claude Code를 재시작하세요.${NC}"
  echo "상태 파일도 제거하려면: ./uninstall.sh --clean"
fi
