#!/usr/bin/env bash
set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if [ ! -d "$HOME/.bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

bun install
args=()
ssl=()
for arg in "$@"; do
  if [ "$arg" = "--ssl" ]; then ssl=(-- --ssl); else args+=("$arg"); fi
done
bun run start -- ${args[@]+"${args[@]}"} ${ssl[@]+"${ssl[@]}"}
