#!/usr/bin/env bash
# Pre-deploy sanity check for the AIWatch ECS box.
#
# Run this from the deploy checkout (where docker-compose.prod.yml + .env live)
# BEFORE `IMAGE_TAG=<tag> bash scripts/deploy-prod.sh`. It only reads/validates —
# it never pulls, builds, or restarts anything.
#
# Catches the recurring footguns: missing IMAGE_TAG (silent :latest rollback),
# missing/blank required .env keys (silent prod failures), no docker, etc.
#
# Usage:
#   IMAGE_TAG=v0.5.2 bash scripts/pre-deploy-check.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.." || { echo "ABORT: cannot cd to repo root"; exit 1; }

ERRORS=0
WARNS=0
err()  { echo "  [FAIL] $*"; ERRORS=$((ERRORS + 1)); }
warn() { echo "  [WARN] $*"; WARNS=$((WARNS + 1)); }
ok()   { echo "  [ok]   $*"; }

echo "=== AIWatch pre-deploy check (repo root: $(pwd)) ==="

# --- IMAGE_TAG ---
if [ -z "${IMAGE_TAG:-}" ]; then
  warn "IMAGE_TAG not set -> deploy-prod.sh would default to :latest (often a stale image). Pin a tag."
elif [ "$IMAGE_TAG" = "latest" ]; then
  warn "IMAGE_TAG=latest -> not pinned to a specific release."
else
  ok "IMAGE_TAG=$IMAGE_TAG"
fi

# --- required files ---
[ -f docker-compose.prod.yml ] && ok "docker-compose.prod.yml present" \
  || err "docker-compose.prod.yml missing in $(pwd)"
[ -f .env ] && ok ".env present" || err ".env missing in $(pwd)"

# --- docker available ---
if command -v docker >/dev/null 2>&1; then
  ok "docker on PATH"
else
  err "docker not found on PATH"
fi

# --- required + recommended .env keys ---
# present-and-nonblank check against .env
env_has() { grep -Eq "^[[:space:]]*$1=[[:space:]]*[^[:space:]]" .env 2>/dev/null; }

REQUIRED=(DATABASE_URL BETTER_AUTH_SECRET BETTER_AUTH_URL CONTRIBUTION_SALT READER_ID_SECRET DATABASE_SSL TRUSTED_PROXY_HOPS)
RECOMMENDED=(OPENAI_COMPATIBLE_BASE_URL LLM_NEWS_PROVIDER LLM_NEWS_MODEL MAX_MONTHLY_LLM_USD TWITTER_AUTH_TOKEN RSSHUB_BASE_URL SOURCE_ALERT_EMAIL RESEND_API_KEY)

if [ -f .env ]; then
  echo "--- required .env keys ---"
  for k in "${REQUIRED[@]}"; do
    env_has "$k" && ok "$k set" || err "$k missing or blank"
  done
  echo "--- recommended .env keys (warn only) ---"
  for k in "${RECOMMENDED[@]}"; do
    env_has "$k" && ok "$k set" || warn "$k missing or blank"
  done
fi

echo "=== summary: $ERRORS error(s), $WARNS warning(s) ==="
if [ "$ERRORS" -gt 0 ]; then
  echo "BLOCK: fix errors before deploying."
  exit 1
fi
echo "PASS. Next:"
echo "  IMAGE_TAG=${IMAGE_TAG:-<tag>} bash scripts/deploy-prod.sh"
echo "Rollback if needed:"
echo "  IMAGE_TAG=<previous-tag> bash scripts/deploy-prod.sh"
