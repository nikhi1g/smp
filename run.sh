#!/usr/bin/env bash
set -e

# Change directory to the repository folder
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
ENV_FILE=".env.local"
DEFAULT_MODEL="deepseek/deepseek-v4-flash-latest"
BASE_URL="https://openrouter.ai/api/v1"

echo "========================================="
echo "   SMP Application Tracker - Launcher    "
echo "========================================="

# Check if OPENROUTER_API_KEY is already configured in .env.local
HAS_KEY=false
if [ -f "$ENV_FILE" ]; then
  if grep -q "OPENROUTER_API_KEY" "$ENV_FILE" 2>/dev/null; then
    EXISTING_KEY=$(grep "OPENROUTER_API_KEY=" "$ENV_FILE" | head -n 1 | cut -d '=' -f2- | tr -d '"' || true)
    if [ -n "$EXISTING_KEY" ]; then
      HAS_KEY=true
    fi
  fi
fi

# If key is missing, prompt for single input (masked password)
if [ "$HAS_KEY" = false ]; then
  echo ""
  echo "No OpenRouter API key found."
  echo -n "Enter your OpenRouter API Key (sk-or-...): "
  read -s API_KEY
  echo ""

  if [ -z "$API_KEY" ]; then
    echo "Error: API key cannot be empty. Aborting."
    exit 1
  fi

  # Write .env.local securely with 600 permissions
  cat <<EOF > "$ENV_FILE"
NEXT_PUBLIC_OPENROUTER_BASE_URL="$BASE_URL"
NEXT_PUBLIC_OPENROUTER_MODEL="$DEFAULT_MODEL"
OPENROUTER_API_KEY="$API_KEY"
NEXT_PUBLIC_OPENROUTER_API_KEY="$API_KEY"
EOF
  chmod 600 "$ENV_FILE"
  echo "✓ API key saved to .env.local (permissions 600, gitignored)."
  echo "✓ Model default: $DEFAULT_MODEL"
  echo ""
fi

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting SMP Tracker on http://localhost:${PORT}..."
exec npx next dev -p "${PORT}"
