#!/usr/bin/env bash
# Rebuild Endless Depths 16, deploy if a host is authenticated, curl-verify,
# then run the save smoke test (including "saves survive a trivial redeploy").
# Usage:
#   ./deploy.sh            build, publish if possible, curl-verify, smoke
#   ./deploy.sh --no-smoke build, publish if possible, curl-verify (used by tests)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

CHROME="${CHROME:-/usr/bin/google-chrome-stable}"
PORT="${ED16_PORT:-50177}"
LOCAL_URL="http://127.0.0.1:${PORT}/"
PUBLIC_URL=""
SKIP_SMOKE=0
if [ "${1:-}" = "--no-smoke" ] || [ "${ED16_SKIP_SMOKE:-}" = "1" ]; then
  SKIP_SMOKE=1
fi

log() { printf '%s\n' "$*"; }

stamp_build() {
  local id="$1"
  printf 'export const ED16_BUILD = "%s";\n' "$id" > src/build-id.ts
  sed "s/__BUILD_ID__/${id}/g" src/sw.template.js > sw.js
  if grep -q 'name="ed16-build"' index.html; then
    sed -i "s/name=\"ed16-build\" content=\"[^\"]*\"/name=\"ed16-build\" content=\"${id}\"/" index.html
  else
    sed -i "s/<meta charset=\"utf-8\">/<meta charset=\"utf-8\">\n  <meta name=\"ed16-build\" content=\"${id}\">/" index.html
  fi
  # Query-bust game.js so GitHub Pages' 10-minute cache cannot serve a stale bundle.
  if grep -q 'src="game.js' index.html; then
    sed -i "s/src=\"game.js[^\"]*\"/src=\"game.js?v=${id}\"/" index.html
  fi
}

build() {
  local id="${1:-$(date +%Y%m%d-%H%M%S)}"
  log "Building ${id}…"
  if [ ! -x node_modules/.bin/esbuild ]; then
    npm install --no-audit --no-fund
  fi
  stamp_build "$id"
  npm run build
  test -s game.js
  touch .nojekyll
  log "Build ok: $(wc -c < game.js) bytes  id=${id}"
}

ensure_local_server() {
  if curl -sf -o /dev/null "$LOCAL_URL"; then
    log "Local server already up at ${LOCAL_URL}"
    return 0
  fi
  log "Starting local static server on ${PORT}…"
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/tmp/ed16-http.log 2>&1 &
  echo $! > /tmp/ed16-http.pid
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf -o /dev/null "$LOCAL_URL"; then
      log "Local server ready"
      return 0
    fi
    sleep 0.2
  done
  log "ERROR: local server did not start"
  return 1
}

fetch_url() {
  # Writes body to $1, prints status. Follows a single trailing-slash hop only.
  local dest="$1" url="$2"
  local code loc slashed
  code="$(curl -sS -o "$dest" -w '%{http_code}' --max-redirs 0 "$url" || true)"
  if [ "$code" = "301" ] || [ "$code" = "302" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then
    loc="$(curl -sI --max-redirs 0 "$url" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2; exit}')"
    slashed="${url%/}/"
    if [ "${loc%/}/" = "$slashed" ] || [ "$loc" = "$slashed" ] || [ "$loc" = "${url%/}" ] || [ "$loc" = "$url" ]; then
      url="$slashed"
      code="$(curl -sS -o "$dest" -w '%{http_code}' --max-redirs 0 "$url" || true)"
    fi
  fi
  printf '%s' "$code"
}

enable_pages() {
  local user="$1" repo="$2"
  if gh api -X POST "repos/${user}/${repo}/pages" \
      -H "Accept: application/vnd.github+json" \
      --input - <<'JSON' >/tmp/ed16-pages-api.json 2>/tmp/ed16-pages-api.err
{"build_type":"legacy","source":{"branch":"main","path":"/"}}
JSON
  then
    log "Pages enabled from main /."
    return 0
  fi
  # Already exists, or POST rejected: set the branch source explicitly.
  if gh api -X PUT "repos/${user}/${repo}/pages" \
      -H "Accept: application/vnd.github+json" \
      --input - <<'JSON' >/tmp/ed16-pages-api.json 2>/tmp/ed16-pages-api.err
{"source":{"branch":"main","path":"/"}}
JSON
  then
    log "Pages source updated to main /."
    return 0
  fi
  log "WARNING: Pages API did not accept enable/update:"
  cat /tmp/ed16-pages-api.err >&2 || true
  return 1
}

wait_for_pages() {
  local url="$1" want="$2"
  log "Waiting for Pages to come up at ${url} (build ${want})…"
  local i code status
  for i in $(seq 1 60); do
    code="$(fetch_url /tmp/ed16-pages.html "$url" || true)"
    if [ "$code" = "200" ] && grep -q "Endless Depths 16" /tmp/ed16-pages.html 2>/dev/null; then
      if [ -n "$want" ] && grep -q "name=\"ed16-build\" content=\"${want}\"" /tmp/ed16-pages.html; then
        js_code="$(curl -sS -o /tmp/ed16-pages.js -w "%{http_code}" --max-redirs 0 "${url}game.js?v=${want}" || true)"
        if [ "$js_code" = "200" ] && grep -q "$want" /tmp/ed16-pages.js; then
          log "Pages is live with build ${want} (HTML and game.js)."
          return 0
        fi
        log "index.html is ${want} but game.js?v=${want} is not ready yet (HTTP ${js_code}); waiting…"
      fi
      if [ -z "$want" ]; then
        log "Pages is live."
        return 0
      fi
      log "Pages is up but still serving an older build (want ${want}); waiting…"
    else
      status="$(gh api "repos/${PAGES_USER}/${PAGES_REPO}/pages" --jq .status 2>/dev/null || true)"
      log "  try ${i}/60  HTTP ${code}  pages.status=${status:-unknown}"
    fi
    sleep 5
  done
  log "ERROR: Pages URL did not serve build ${want} in time: ${url}"
  return 1
}

try_public_deploy() {
  if ! command -v gh >/dev/null 2>&1; then
    log "gh CLI not found; skipping public deploy."
    return 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    log "GitHub is not authenticated on this machine."
    log "For a stable public HTTPS URL (GitHub Pages), run this once, then rerun ./deploy.sh:"
    log "  gh auth login"
    return 1
  fi
  local user repo
  user="$(gh api user --jq .login)"
  repo="endless-depths-16"
  PAGES_USER="$user"
  PAGES_REPO="$repo"
  PUBLIC_URL="https://${user}.github.io/${repo}/"
  log "Authenticated as ${user}; deploying to GitHub Pages (${user}/${repo})…"

  if [ ! -d "$ROOT/.git" ]; then
    git init -b main
    git config user.email "ed16-deploy@localhost"
    git config user.name "Endless Depths 16 deploy"
  fi

  git add -A
  if git diff --cached --quiet && git rev-parse --verify HEAD >/dev/null 2>&1; then
    log "No git changes to commit."
  else
    git commit -m "Deploy Endless Depths 16 ${ED16_BUILD_ID:-update}"
  fi

  if ! git remote get-url origin >/dev/null 2>&1; then
    if ! gh repo view "${user}/${repo}" >/dev/null 2>&1; then
      gh repo create "${repo}" --public --source "$ROOT" --remote origin --description "Endless Depths 16 standalone" --push
    else
      git remote add origin "https://github.com/${user}/${repo}.git"
      git push -u origin HEAD:main
    fi
  else
    git push -u origin HEAD:main
  fi

  enable_pages "$user" "$repo" || true
  gh api -X POST "repos/${user}/${repo}/pages/builds" >/dev/null 2>&1 || true
  wait_for_pages "$PUBLIC_URL" "$ED16_BUILD_ID"
}

curl_verify() {
  local url="$1"
  log "curl-verify ${url}"
  local tmp=/tmp/ed16-curl-body.html
  local code
  code="$(fetch_url "$tmp" "$url")"
  if [ "$code" != "200" ]; then
    log "FAIL curl-verify: HTTP ${code} for ${url}"
    return 1
  fi
  if ! grep -q "Endless Depths 16" "$tmp" || ! grep -q "game.js" "$tmp"; then
    log "FAIL curl-verify: response was not the game HTML"
    return 1
  fi
  log "PASS curl-verify: 200 and game HTML at ${url}"
}

# --- main ---
ED16_BUILD_ID="${ED16_BUILD_ID:-$(date +%Y%m%d-%H%M%S)}"
build "$ED16_BUILD_ID"

VERIFY_URL="$LOCAL_URL"
if gh auth status >/dev/null 2>&1; then
  if try_public_deploy; then
    VERIFY_URL="$PUBLIC_URL"
  else
    log "ERROR: authenticated, but the public GitHub Pages deploy did not come up."
    exit 1
  fi
else
  log "GitHub is not authenticated; serving locally. Run: gh auth login"
  ensure_local_server
  VERIFY_URL="$LOCAL_URL"
fi

curl_verify "$VERIFY_URL"

if [ "$SKIP_SMOKE" = "1" ]; then
  log "Skipping smoke (--no-smoke). URL=${VERIFY_URL}"
  printf '%s\n' "$VERIFY_URL" > /tmp/ed16-last-url.txt
  exit 0
fi

log "Running save smoke test against ${VERIFY_URL}…"
export ED16_URL="$VERIFY_URL"
export CHROME
export ED16_ROOT="$ROOT"
node tests/smoke.mjs
log "deploy.sh finished. URL=${VERIFY_URL}"
printf '%s\n' "$VERIFY_URL" > /tmp/ed16-last-url.txt
