#!/usr/bin/env bash
#
# Create or refresh the React baseline that the gallery pixel-diffs against
# during the svelte migration.
#
# It is a detached worktree of master with its own node_modules. The separate
# install is the point: once react, redux and material-ui are removed from this
# branch's package.json, a baseline sharing this repo's node_modules would stop
# building. It also lives outside the repo so vite, jest and oxlint never scan it.
#
#   ./scripts/react-baseline.sh              # baseline at master
#   ./scripts/react-baseline.sh <ref>        # baseline at some other ref
#   REACT_BASELINE_DIR=/path ./scripts/react-baseline.sh
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="${1:-master}"
DIR="${REACT_BASELINE_DIR:-${REPO}-react-baseline}"

cd "$REPO"

if [ -d "$DIR/.git" ] || [ -f "$DIR/.git" ]; then
  echo "==> refreshing existing baseline at $DIR"
  git -C "$DIR" checkout --detach "$REF"
else
  echo "==> creating baseline worktree at $DIR"
  git worktree add --detach "$DIR" "$REF"
fi

echo "==> installing the baseline's own dependencies"
( cd "$DIR" && bun install --frozen-lockfile )

SHA="$(git -C "$DIR" rev-parse HEAD)"
echo
echo "baseline ready: $DIR @ ${SHA:0:9} ($REF)"
echo
echo "diff the svelte app against it with:"
echo "  node scripts/build-gallery.mjs --output ./dist-gallery \\"
echo "    --base $DIR --base-sha $SHA \\"
echo "    --states signin"
