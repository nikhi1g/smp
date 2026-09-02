#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

ENV_FILE=".env.local"
DEFAULT_MODEL="deepseek/deepseek-v4-flash-latest"
BASE_URL="https://openrouter.ai/api/v1"

echo "========================================="
echo "       SMP Tracker Key Setup             "
echo "========================================="
echo ""
echo -n "Enter your OpenRouter API Key (sk-or-...): "
read -s API_KEY
echo ""

if [ -z "$API_KEY" ]; then
  echo "Error: API key cannot be empty. Aborting."
  exit 1
fi

# Overwrite .env.local securely with 1 single input
cat <<EOF > "$ENV_FILE"
NEXT_PUBLIC_OPENROUTER_BASE_URL="$BASE_URL"
NEXT_PUBLIC_OPENROUTER_MODEL="$DEFAULT_MODEL"
OPENROUTER_API_KEY="$API_KEY"
NEXT_PUBLIC_OPENROUTER_API_KEY="$API_KEY"
EOF

chmod 600 "$ENV_FILE"

echo "✓ Overwrote .env.local with your new OpenRouter key (permissions 600)."
echo "✓ Model: $DEFAULT_MODEL"
echo "✓ Done. You can now launch with ./run.sh"
