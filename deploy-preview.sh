#!/bin/bash
set -e

BRANCH="${1:-$(git branch --show-current)}"

PREVIEW=1 bun build:production
bunx wrangler pages deploy dist --project-name=connect --branch="$BRANCH"

echo ""
echo "Preview URL: https://${BRANCH}.connect-d5y.pages.dev"
