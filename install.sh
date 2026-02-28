#!/bin/bash
set -euo pipefail

# UAM Plugin Installer
UAM_ROOT="$(cd "$(dirname "$0")" && pwd)"
GLOBAL_PLUGIN_DIR="$HOME/.claude/plugins/marketplaces/uam"
PROJECT_PLUGIN_DIR=".claude/plugins/uam"

# Color output
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${GREEN}UAM Plugin Installer${NC}"
echo "━━━━━━━━━━━━━━━━━━━━"

# Parse flags or prompt for scope
SCOPE="${1:-}"
if [[ "$SCOPE" == "--global" ]]; then
  SCOPE="global"
elif [[ "$SCOPE" == "--project" ]]; then
  SCOPE="project"
elif [[ -z "$SCOPE" ]]; then
  echo ""
  echo "설치 범위를 선택하세요:"
  echo "  1) global  — 모든 프로젝트에서 /uam:* 사용 가능 (권장)"
  echo "  2) project — 현재 프로젝트에서만 /project:uam-* 사용 가능"
  echo ""
  read -p "선택 [1/2]: " choice
  case "$choice" in
    1|global) SCOPE="global" ;;
    2|project) SCOPE="project" ;;
    *) echo -e "${RED}잘못된 선택${NC}"; exit 1 ;;
  esac
fi

# Prerequisite check
if ! command -v node &>/dev/null; then
  echo -e "${RED}Error: Node.js 16+ required${NC}"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if (( NODE_VER < 16 )); then
  echo -e "${RED}Error: Node.js 16+ required (found v${NODE_VER})${NC}"
  exit 1
fi

# Install based on scope
if [[ "$SCOPE" == "global" ]]; then
  TARGET_DIR="$GLOBAL_PLUGIN_DIR"
  mkdir -p "$(dirname "$TARGET_DIR")"

  if [[ -L "$TARGET_DIR" ]]; then
    EXISTING=$(readlink "$TARGET_DIR")
    if [[ "$EXISTING" == "$UAM_ROOT" ]]; then
      echo -e "${YELLOW}이미 설치됨: $TARGET_DIR → $UAM_ROOT${NC}"
      exit 0
    fi
    echo -e "${YELLOW}기존 심링크 교체: $EXISTING → $UAM_ROOT${NC}"
    rm "$TARGET_DIR"
  elif [[ -d "$TARGET_DIR" ]]; then
    echo -e "${RED}Error: $TARGET_DIR 이미 존재 (디렉토리). 먼저 제거하세요.${NC}"
    exit 1
  fi

  ln -s "$UAM_ROOT" "$TARGET_DIR"
  echo -e "${GREEN}✓ Global 설치 완료${NC}"
  echo "  $TARGET_DIR → $UAM_ROOT"
  echo ""
  echo "스킬 접두사: /uam:*"
  echo "예시: /uam:uam, /uam:uam-small, /uam:uam-status"

elif [[ "$SCOPE" == "project" ]]; then
  TARGET_DIR="$PROJECT_PLUGIN_DIR"

  if [[ ! -d ".git" ]]; then
    echo -e "${YELLOW}Warning: .git 디렉토리 없음. 프로젝트 루트에서 실행하세요.${NC}"
  fi

  mkdir -p "$(dirname "$TARGET_DIR")"

  if [[ -L "$TARGET_DIR" ]]; then
    EXISTING=$(readlink "$TARGET_DIR")
    if [[ "$EXISTING" == "$UAM_ROOT" ]]; then
      echo -e "${YELLOW}이미 설치됨: $TARGET_DIR → $UAM_ROOT${NC}"
      exit 0
    fi
    rm "$TARGET_DIR"
  fi

  ln -s "$UAM_ROOT" "$TARGET_DIR"
  echo -e "${GREEN}✓ Project 설치 완료${NC}"
  echo "  $TARGET_DIR → $UAM_ROOT"
  echo ""
  echo "스킬 접두사: /project:uam-*"

  # Add to .gitignore if not already
  if [[ -f .gitignore ]]; then
    if ! grep -q ".claude/plugins/" .gitignore 2>/dev/null; then
      echo ".claude/plugins/" >> .gitignore
      echo -e "${GREEN}✓ .gitignore에 .claude/plugins/ 추가${NC}"
    fi
  fi
fi

echo ""
echo -e "${GREEN}설치 완료! Claude Code를 재시작하면 활성화됩니다.${NC}"
echo "제거: ./uninstall.sh 또는 /uam:uam-manage uninstall"
