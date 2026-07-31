#!/bin/bash
set -e

BRANCH="${1:-$(git branch --show-current)}"

PREVIEW=1 bun build:production
bun run build:gallery
cp dist-gallery/connect-gallery.html dist/connect-gallery.html
bunx wrangler pages deploy dist --project-name=connect --branch="$BRANCH"

echo ""
echo "Preview URL: https://${BRANCH}.connect-d5y.pages.dev"
echo "Gallery report: https://${BRANCH}.connect-d5y.pages.dev/connect-gallery.html"
