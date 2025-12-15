#!/bin/bash
set -e

# Deploy to Cloudflare Pages preview
# Usage: ./deploy-preview.sh [branch-name]
# If no branch name provided, uses current git branch

BRANCH="${1:-$(git branch --show-current)}"
PROJECT="connect"

echo "Building..."
bun build:production

echo "Deploying to Cloudflare Pages (branch: $BRANCH)..."
bunx wrangler pages deploy dist --project-name="$PROJECT" --branch="$BRANCH"

echo ""
echo "Preview URL: https://${BRANCH}.connect-d5y.pages.dev"
