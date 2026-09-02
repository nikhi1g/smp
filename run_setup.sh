#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "========================================="
echo "   SMP Tracker - Cloudflare Key Setup    "
echo "========================================="
echo ""
echo "This script securely stores your OpenRouter API key"
echo "as an encrypted secret on your Cloudflare Worker (smp-api)."
echo ""
echo -n "Enter your OpenRouter API Key (sk-or-...): "
read -s API_KEY
echo ""

if [ -z "$API_KEY" ]; then
  echo "Error: API key cannot be empty. Aborting."
  exit 1
fi

echo "Uploading secret to Cloudflare Worker 'smp-api'..."
echo -n "$API_KEY" | npx wrangler secret put OPENROUTER_API_KEY

echo ""
echo "✓ Secret OPENROUTER_API_KEY successfully saved on Cloudflare Worker."
echo "✓ Live autofill at https://nikhi1g.github.io/smp/ is now active."
