#!/bin/bash
set -e

BRANCH="${1:-$(git branch --show-current)}"
export PREVIEW=1

bun install --cwd scripts --frozen-lockfile
bun run build:gallery -- --output dist --baseline-url https://latest.connect-d5y.pages.dev
bunx wrangler pages deploy dist --project-name=connect --branch="$BRANCH"

echo ""
echo "Preview URL: https://${BRANCH}.connect-d5y.pages.dev"
echo "Gallery report: https://${BRANCH}.connect-d5y.pages.dev/connect-gallery.html"
