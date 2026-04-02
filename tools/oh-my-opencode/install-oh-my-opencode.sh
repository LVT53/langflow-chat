#!/usr/bin/env bash
set -euo pipefail

# Non-interactive installer wrapper for oh-my-opencode
# Places repo-local .opencode config if requested and runs the bunx installer with sensible defaults.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'USAGE'
Usage: install-oh-my-opencode.sh [--repo-local] [--claude <yes|no|max20>] [--openai <yes|no>] [--gemini <yes|no>] [--copilot <yes|no>] [--opencode-zen <yes|no>] [--zai-coding-plan <yes|no>] [--opencode-go <yes|no>]

Options:
  --repo-local           Create a .opencode/oh-my-openagent.json in the repo instead of using ~/.config/opencode/
  --claude VALUE         claude flag (yes|no|max20). Default: no
  --openai VALUE         openai flag (yes|no). Default: no
  --gemini VALUE         gemini flag (yes|no). Default: no
  --copilot VALUE        copilot flag (yes|no). Default: no
  --opencode-zen VALUE   opencode-zen flag (yes|no). Default: no
  --zai-coding-plan VALUE zai-coding-plan flag (yes|no). Default: no
  --opencode-go VALUE    opencode-go flag (yes|no). Default: no
  -h, --help             Show this help
USAGE
}

# defaults
REPO_LOCAL=false
CLAUDE=no
OPENAI=no
GEMINI=no
COPILOT=no
OPENCODE_ZEN=no
ZAI_CODING_PLAN=no
OPENCODE_GO=no

while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --repo-local) REPO_LOCAL=true; shift ;;
    --claude) CLAUDE="$2"; shift 2 ;;
    --openai) OPENAI="$2"; shift 2 ;;
    --gemini) GEMINI="$2"; shift 2 ;;
    --copilot) COPILOT="$2"; shift 2 ;;
    --opencode-zen) OPENCODE_ZEN="$2"; shift 2 ;;
    --zai-coding-plan) ZAI_CODING_PLAN="$2"; shift 2 ;;
    --opencode-go) OPENCODE_GO="$2"; shift 2 ;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2;;
  esac
done

# Check for bunx or npx
if command -v bunx >/dev/null 2>&1; then
  RUNNER="bunx"
elif command -v npx >/dev/null 2>&1; then
  RUNNER="npx"
else
  echo "Error: neither 'bunx' nor 'npx' found on PATH. Please install bun or Node.js." >&2
  exit 3
fi

INSTALL_CMD=("$RUNNER" "oh-my-opencode" "install" "--no-tui" \
  "--claude=${CLAUDE}" "--openai=${OPENAI}" "--gemini=${GEMINI}" "--copilot=${COPILOT}" \
  "--opencode-zen=${OPENCODE_ZEN}" "--zai-coding-plan=${ZAI_CODING_PLAN}" "--opencode-go=${OPENCODE_GO}")

echo "Running installer: ${INSTALL_CMD[*]}"
"${INSTALL_CMD[@]}"

echo "Installer finished."

if [ "$REPO_LOCAL" = true ]; then
  echo "Creating repository-local .opencode/oh-my-openagent.json if not present"
  mkdir -p .opencode
  if [ ! -f .opencode/oh-my-openagent.json ]; then
    cat > .opencode/oh-my-openagent.json <<JSON
{
  "agents": {
    "multimodal-looker": { "model": "google/antigravity-gemini-3-flash" }
  }
}
JSON
    echo "Wrote .opencode/oh-my-openagent.json"
  else
    echo ".opencode/oh-my-openagent.json already exists — skipping"
  fi
fi

echo "Run 'opencode auth login' to authenticate any providers (Anthropic/Google) interactively." 

echo "You can verify installation with: opencode --version && bunx oh-my-opencode doctor"

exit 0
