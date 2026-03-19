#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${PR_ENRICH_BRANCH:-main}"
ATTEMPTS="${PR_ENRICH_ATTEMPTS:-3}"
DEFAULT_PROXY_BASE_URL="http://100.81.203.52:8317"
DEFAULT_PROXY_KEY_FILE="/opt/cliproxyapi/API_KEY.txt"

cd "$REPO_DIR"

export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}"
export CLIPROXY_BASE_URL="${CLIPROXY_BASE_URL:-$DEFAULT_PROXY_BASE_URL}"
if [[ -z "${CLIPROXY_API_KEY:-}" && -f "$DEFAULT_PROXY_KEY_FILE" ]]; then
  export CLIPROXY_API_KEY="$(cat "$DEFAULT_PROXY_KEY_FILE")"
fi

if [[ -z "${CLIPROXY_API_KEY:-}" ]]; then
  echo "CLIPROXY_API_KEY is not configured."
  exit 1
fi

for attempt in $(seq 1 "$ATTEMPTS"); do
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
  git config user.name "ubuntu-pr-enricher"
  git config user.email "ubuntu-pr-enricher@users.noreply.github.com"

  npm run collect
  npm run enrich:prs

  git add docs/data .cache
  if git diff --cached --quiet; then
    echo "No data changes"
    exit 0
  fi

  npm run version:data
  git add docs/data/version.json docs/data .cache

  git commit -m "chore(data): refresh leaderboard data [skip ci]"

  if git push origin "$BRANCH"; then
    echo "Leaderboard refresh push succeeded"
    exit 0
  fi

  echo "Push rejected on attempt ${attempt}; retrying from latest ${BRANCH}"
done

echo "Failed to publish leaderboard refresh after ${ATTEMPTS} attempts"
exit 1
