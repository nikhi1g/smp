#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "========================================="
echo "   OpenRouter API Key Configuration      "
echo "========================================="
echo ""
echo "This script securely stores your OpenRouter API token in .env.local"
echo "(which is excluded by .gitignore and never committed to git)."
echo ""

# Prompt for API Key with hidden input (password style)
echo -n "Enter your OpenRouter API Key (sk-or-...): "
read -s API_KEY
echo ""

if [ -z "$API_KEY" ]; then
  echo "Error: No API key entered. Aborting."
  exit 1
fi

echo -n "Enter Model Name (Press Enter for default: deepseek/deepseek-v4-flash-latest): "
read MODEL_NAME
if [ -z "$MODEL_NAME" ]; then
  MODEL_NAME="deepseek/deepseek-v4-flash-latest"
fi

BASE_URL="https://openrouter.ai/api/v1"

# Write/Update .env.local securely with 600 permissions
ENV_FILE=".env.local"

if [ -f "$ENV_FILE" ]; then
  sed -i.bak '/OPENROUTER_/d' "$ENV_FILE" 2>/dev/null || true
  sed -i.bak '/MUSE_SPARK_/d' "$ENV_FILE" 2>/dev/null || true
  rm -f "${ENV_FILE}.bak" 2>/dev/null || true
fi

cat <<EOF >> "$ENV_FILE"
NEXT_PUBLIC_OPENROUTER_BASE_URL="$BASE_URL"
NEXT_PUBLIC_OPENROUTER_MODEL="$MODEL_NAME"
OPENROUTER_API_KEY="$API_KEY"
NEXT_PUBLIC_OPENROUTER_API_KEY="$API_KEY"
EOF

chmod 600 "$ENV_FILE"

echo ""
echo "✓ OpenRouter API key and configuration saved to .env.local (permissions 600)."
echo "✓ Autofill is now configured with OpenRouter."
