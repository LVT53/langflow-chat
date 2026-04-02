Oh My OpenCode — repository-local installer

This folder contains a small non-interactive wrapper script to install and configure
oh-my-opencode according to the upstream guide.

Files:
- install-oh-my-opencode.sh — wrapper that runs the upstream installer non-interactively
- oh-my-openagent.example.json — example repo-local plugin config

Usage:

1. Make the script executable (once):

   chmod +x tools/oh-my-opencode/install-oh-my-opencode.sh

2. Run the installer with desired flags. Examples:

   # Install using bunx (if available) and create repo-local config
   tools/oh-my-opencode/install-oh-my-opencode.sh --repo-local --claude=max20 --openai=yes --gemini=yes

   # Minimal install (no native providers)
   tools/oh-my-opencode/install-oh-my-opencode.sh --claude=no --openai=no --gemini=no --copilot=no

What the script does:
- Invokes bunx or npx to run `oh-my-opencode install --no-tui ...` non-interactively
- Optionally creates .opencode/oh-my-openagent.json in the repository when --repo-local is passed

Notes and verification:
- The upstream installer writes to ~/.config/opencode/opencode.json by default. Using --repo-local causes
  a local .opencode/oh-my-openagent.json to be created; the OpenCode runtime recognizes repo-local configs.
- After installation, authenticate providers interactively with `opencode auth login`.
- Verify with: `opencode --version` and `bunx oh-my-opencode doctor`
