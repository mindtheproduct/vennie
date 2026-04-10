#!/usr/bin/env bash
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; }
err()  { echo -e "  ${RED}✗${RESET} $1"; }
info() { echo -e "  ${CYAN}ℹ${RESET} $1"; }
step() { echo -e "\n${BOLD}→ $1${RESET}"; }

# ── Banner ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}${BOLD}"
cat << 'MASCOT'
        ___
     .-'   `-.
    /  °   °  \
   |  (  ^  )  |
    \  `---'  /
     `-.___.--'
    /|  |||  |\
   / |  |||  | \
      |  |  |
      ~  ~  ~
MASCOT
echo -e "${RESET}"
echo -e "${BOLD}${CYAN}  Vennie${RESET} v1.0.0 — Your AI Product Operating System"
echo -e "${DIM}  by Mind the Product${RESET}"
echo ""

# ── Platform detection ────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)
    err "Unsupported platform: $OS"
    echo "  Vennie supports macOS and Linux."
    exit 1
    ;;
esac

info "Detected ${BOLD}$PLATFORM${RESET} ($ARCH)"

# ── Helper: check if command exists ──────────────────────────────────────────

has() { command -v "$1" &>/dev/null; }

# ── Helper: install with package manager ─────────────────────────────────────

pkg_install() {
  local pkg="$1"
  if [ "$PLATFORM" = "macos" ]; then
    if has brew; then
      info "Installing $pkg with Homebrew..."
      brew install "$pkg"
      return $?
    else
      err "Homebrew not found. Install it first:"
      echo "    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      return 1
    fi
  elif [ "$PLATFORM" = "linux" ]; then
    if has apt-get; then
      info "Installing $pkg with apt..."
      sudo apt-get update -qq && sudo apt-get install -y -qq "$pkg"
      return $?
    elif has dnf; then
      info "Installing $pkg with dnf..."
      sudo dnf install -y "$pkg"
      return $?
    elif has pacman; then
      info "Installing $pkg with pacman..."
      sudo pacman -S --noconfirm "$pkg"
      return $?
    else
      err "No supported package manager found (apt, dnf, pacman)."
      return 1
    fi
  fi
}

# ── 1. Check Node.js ─────────────────────────────────────────────────────────

step "Checking Node.js"

if has node; then
  NODE_VER=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "Node.js v$NODE_VER"
  else
    warn "Node.js v$NODE_VER found — need v18+"
    info "Upgrading Node.js..."
    if [ "$PLATFORM" = "macos" ]; then
      pkg_install node || { err "Failed to upgrade Node.js"; exit 1; }
    else
      if has curl; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
      else
        pkg_install nodejs
      fi
    fi
    ok "Node.js updated to $(node -v)"
  fi
else
  warn "Node.js not found — installing..."
  if [ "$PLATFORM" = "macos" ]; then
    pkg_install node || { err "Failed to install Node.js"; exit 1; }
  else
    if has curl; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
    else
      pkg_install nodejs || { err "Failed to install Node.js"; exit 1; }
    fi
  fi
  ok "Node.js $(node -v) installed"
fi

# ── 2. Check Python (optional) ──────────────────────────────────────────────

step "Checking Python (optional — for MCP integrations)"

PYTHON_CMD=""
if has python3; then
  PYTHON_CMD="python3"
elif has python; then
  PYTHON_CMD="python"
fi

if [ -n "$PYTHON_CMD" ]; then
  PY_VER=$($PYTHON_CMD --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
  PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
  PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
  if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 8 ]; then
    ok "$($PYTHON_CMD --version)"
  else
    info "$($PYTHON_CMD --version) — Python 3.8+ recommended for MCP integrations"
  fi
else
  info "Python not found — not required, but enables MCP server integrations"
fi

# ── 3. Install Python dependencies (if Python available) ─────────────────────

if [ -n "$PYTHON_CMD" ]; then
  PIP_CMD=""
  if has pip3; then PIP_CMD="pip3"; elif has pip; then PIP_CMD="pip"; fi

  if [ -n "$PIP_CMD" ]; then
    step "Installing Python dependencies"
    $PIP_CMD install mcp pyyaml --quiet 2>/dev/null && ok "mcp, pyyaml" || {
      info "Optional: run ${CYAN}$PIP_CMD install mcp pyyaml${RESET} for MCP integrations"
    }
  fi
fi

# ── 4. Install Vennie ────────────────────────────────────────────────────────

step "Installing Vennie"

if has vennie; then
  CURRENT_VER=$(vennie --version 2>/dev/null || echo "unknown")
  info "Vennie already installed ($CURRENT_VER) — upgrading..."
fi

npm install -g vennie@latest 2>/dev/null || {
  # If npm registry doesn't have it yet, install from GitHub
  info "Installing from GitHub..."
  npm install -g github:mindtheproduct/vennie 2>/dev/null || {
    err "Failed to install Vennie."
    echo ""
    echo "  Try manually:"
    echo -e "    ${CYAN}git clone https://github.com/mindtheproduct/vennie.git${RESET}"
    echo -e "    ${CYAN}cd vennie && npm install -g .${RESET}"
    exit 1
  }
}

ok "Vennie installed ($(vennie --version 2>/dev/null || echo 'v1.0.0'))"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}  Installation complete!${RESET}"
echo ""
echo -e "  ${BOLD}Get started:${RESET}"
echo ""
echo -e "    ${GREEN}${BOLD}vennie setup${RESET}    Set up your Anthropic API key"
echo -e "    ${GREEN}${BOLD}vennie init${RESET}     Create your vault and start onboarding"
echo -e "    ${DIM}vennie${RESET}          Start a session"
echo -e "    ${DIM}vennie doctor${RESET}    Check system health"
echo ""
echo -e "  ${DIM}Docs: https://vennie.ai/docs${RESET}"
echo -e "  ${DIM}GitHub: https://github.com/mindtheproduct/vennie${RESET}"
echo ""
