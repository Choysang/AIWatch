#!/usr/bin/env bash
# Pull-only production deploy for the AIWatch ECS box.
#
# Builds happen on GitHub Actions (.github/workflows/release.yml) and are pushed to GHCR.
# This script never builds — it only pulls prebuilt images, runs an ISOLATED one-shot
# migration, then recreates web+worker. db + rsshub are left running. This avoids the OOM /
# swap-thrash that local image builds caused on the 3.5 GB box.
#
# Layout assumption: run from a checkout that has docker-compose.prod.yml + .env at its root
# (the script cd's to the repo root relative to itself).
#
# Usage:
#   IMAGE_TAG=sha-<full-git-sha> bash scripts/deploy-prod.sh   # pin a release (recommended)
#   bash scripts/deploy-prod.sh                                 # deploy :latest
#
# One-time GHCR login (private images need a classic PAT with read:packages, or a
# fine-grained token with "read" on packages):
#   echo "$GHCR_PAT" | docker login ghcr.io -u <github-user> --password-stdin
# Or export GHCR_USER + GHCR_PAT and this script will log in for you.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.." || { echo "ABORT: cannot cd to repo root"; exit 1; }

if [ ! -f docker-compose.prod.yml ]; then
  echo "ABORT: docker-compose.prod.yml not found in $(pwd)"; exit 1
fi
if [ ! -f .env ]; then
  echo "ABORT: .env not found in $(pwd) (web/worker need it)"; exit 1
fi

PROJECT=aiwatch
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.prod.yml)
export IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "=== AIWatch deploy: IMAGE_TAG=$IMAGE_TAG ==="

# Optional inline login when a PAT is supplied in the environment.
if [ -n "${GHCR_PAT:-}" ] && [ -n "${GHCR_USER:-}" ]; then
  echo "=== docker login ghcr.io ==="
  echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin \
    || { echo "LOGIN_FAILED"; exit 1; }
fi

echo "=== pull web + worker images ==="
"${COMPOSE[@]}" pull web worker || { echo "PULL_FAILED (logged in to ghcr.io?)"; exit 1; }

echo "=== ensure db is up (needed for the migration) ==="
"${COMPOSE[@]}" up -d db
for i in $(seq 1 20); do
  H=$(docker inspect -f '{{.State.Health.Status}}' aiwatch-db-1 2>/dev/null || echo none)
  echo "  db health attempt $i: $H"
  [ "$H" = "healthy" ] && break
  sleep 3
done

echo "=== isolated one-shot migration (throwaway container; live web/worker untouched) ==="
"${COMPOSE[@]}" run --rm --no-deps web bun run db:migrate
MIG=$?
echo "MIGRATE_EXIT=$MIG"
[ "$MIG" -ne 0 ] && { echo "MIGRATE_FAILED — old stack still serving, aborting before restart"; exit 1; }

echo "=== up -d (recreate web+worker from pulled images; db+rsshub stay) ==="
"${COMPOSE[@]}" up -d || { echo "UP_FAILED"; exit 1; }

echo "=== wait for web health (up to ~60s) ==="
CODE=000
for i in $(seq 1 20); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ || echo 000)
  echo "  attempt $i: HTTP $CODE"
  [ "$CODE" = "200" ] && break
  sleep 3
done

echo "=== container status ==="
"${COMPOSE[@]}" ps

if [ "$CODE" != "200" ]; then
  echo "HEALTH_FAILED (last=$CODE)"
  docker logs --tail 40 aiwatch-web-1 2>&1 || true
  exit 2
fi

echo "=== prune dangling images (reclaim disk on the small box) ==="
docker image prune -f >/dev/null 2>&1 || true

echo "DEPLOY_OK (IMAGE_TAG=$IMAGE_TAG)"
