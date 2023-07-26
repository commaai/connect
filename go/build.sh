#!/usr/bin/env bash
cd "$(dirname "$0")"
docker compose build --build-arg VITE_APP_GIT_SHA=$(git show -s --format=%H) --build-arg VITE_APP_GIT_TIMESTAMP=$(git show -s --format=%cI)
