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
while [ $# -gt 0 ]; do
  case "$1" in
    --ssl) ssl=(-- --ssl) ;;
    # dev login bypass: ./live.sh --token <jwt>  (or --token=<jwt>)
    --token) export VITE_DEV_AUTH_TOKEN="${2:?--token requires a value}"; shift ;;
    --token=*) export VITE_DEV_AUTH_TOKEN="${1#--token=}" ;;
    *) args+=("$1") ;;
  esac
  shift
done
bun run start -- ${args[@]+"${args[@]}"} ${ssl[@]+"${ssl[@]}"}
