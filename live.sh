#!/usr/bin/env bash
set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

usage() {
  cat <<'USAGE'
Usage: ./live.sh [mock] [scenario] [scan] [--no-open] [-- vite args...]

  ./live.sh                  dev server against the real comma API
  ./live.sh mock             dev server against the bundled mock backend
  ./live.sh noprime          ... in the noprime scenario, mock implied
  ./live.sh scan             outline the DOM as it changes, for chasing updates
  ./live.sh --no-open        do not open a browser
  ./live.sh -- --host        anything after -- goes to vite

A browser opens on the dev server once it is listening. vite does the opening,
so it opens the port actually bound, which is not always 3000.
USAGE
}

# The scenarios the mock backend knows, read from the mock itself so this can
# not drift from it.
scenarios() {
  sed -n "s/^export const SCENARIOS = \[\(.*\)\];.*/\1/p" config/mock/fixtures.js \
    | tr -d "' " | tr ',' ' '
}
KNOWN_SCENARIOS="$(scenarios)"

MOCK=0
SCENARIO=""
OPEN=1
SCAN=0
VITE_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    mock|start:mock) MOCK=1 ;;
    scan|--scan) SCAN=1 ;;
    --no-open) OPEN=0 ;;
    --) shift; VITE_ARGS+=("$@"); break ;;
    *)
      # a bare scenario name is enough; asking for one means asking for mock
      if [ -n "$KNOWN_SCENARIOS" ] && [[ " $KNOWN_SCENARIOS " == *" $1 "* ]]; then
        SCENARIO="$1"
        MOCK=1
      elif [ "$MOCK" = 1 ] && [ -z "$SCENARIO" ] && [[ "$1" != -* ]]; then
        echo "live.sh: unknown mock scenario '$1'" >&2
        echo "         known scenarios: ${KNOWN_SCENARIOS// /, }" >&2
        exit 1
      else
        VITE_ARGS+=("$1")
      fi
      ;;
  esac
  shift
done

# Opening a browser on a machine with nothing to open it on is just an error in
# the log, so only ask for it where it can work.
can_open() {
  [ -n "${CI:-}" ] && return 1
  case "$(uname -s)" in
    Darwin|MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  grep -qi microsoft /proc/version 2>/dev/null && return 0
  [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]
}

if [ "$OPEN" = 1 ]; then
  if can_open; then
    VITE_ARGS+=(--open)
  else
    echo "live.sh: no display to open a browser on, starting without one" >&2
  fi
fi

if [ ! -d "$HOME/.bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

SCRIPT=start
if [ "$MOCK" = 1 ]; then
  SCRIPT=start:mock
  if [ -n "$SCENARIO" ]; then
    export VITE_MOCK_SCENARIO="$SCENARIO"
    echo "live.sh: mock backend, $SCENARIO scenario"
  else
    echo "live.sh: mock backend"
  fi
fi

# Read by src/routes/+layout.svelte, which gates the scanner on `dev` as well,
# so setting this against a production build still cannot ship it.
if [ "$SCAN" = 1 ]; then
  export VITE_RENDER_SCAN=1
  echo "live.sh: render scan on"
fi

bun install
exec bun run "$SCRIPT" -- ${VITE_ARGS[@]+"${VITE_ARGS[@]}"}
