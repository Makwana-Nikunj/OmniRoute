#!/bin/sh
# Litestream restore-then-run wrapper for OmniRoute on ephemeral hosts (Render).
#
# IMPORTANT: this file is invoked as CMD, not ENTRYPOINT. runner-base's
# ENTRYPOINT (/app/check-permissions.sh) stays untouched -- it validates
# DATA_DIR permissions and applies OMNIROUTE_MEMORY_MB, then does
# `exec "$@"`, which runs this script. Do not add a second ENTRYPOINT line
# in the Dockerfile or you lose that check silently.
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
DB_PATH="${DATA_DIR}/storage.sqlite"

# Bound V8 heap to 300MB for Render Free tier (512MB container limit).
# 360MB pushed container RSS to 536MB, hitting the 512MB cgroup ceiling and freezing CPU in memory reclaim.
# 300MB gives Node plenty of heap while keeping container RSS at ~410MB safely below the 512MB limit.
export OMNIROUTE_MEMORY_MB="300"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=300"

# Lean startup: skip non-essential boot modules (skills, compliance, cloud sync, spend
# tracking, proxy schedulers, vacuum, cleanup, model catalog warmup, API bridge, etc.)
# to reduce cold-start time and memory footprint for API-proxy-only deployments.
export OMNIROUTE_LEAN_STARTUP="true"

# Disable heavy background sync tasks and subsystems that waste CPU and memory on Render Free
export ARENA_ELO_SYNC_ENABLED="false"
export PRICING_SYNC_ENABLED="false"
export MODELS_DEV_SYNC_ENABLED="0"
export FREE_PROXY_AUTO_SYNC_ENABLED="false"
export OMNIROUTE_DISABLE_BACKGROUND_SERVICES="true"
export OMNIROUTE_DISABLE_CREDENTIAL_HEALTH_CHECK="true"
export OMNIROUTE_DISABLE_LOCAL_HEALTHCHECK="true"
export OMNIROUTE_DISABLE_TOKEN_HEALTHCHECK="true"
export OMNIROUTE_DISABLE_CONNECTION_RECOVERY="true"
export OMNIROUTE_A2A_MEMORY_HITS="0"
export OMNIROUTE_ENABLE_LIVE_WS="false"
export OMNIROUTE_WARMUP_ENABLED="false"

echo "[entrypoint] DATA_DIR=${DATA_DIR}"
echo "[entrypoint] Database=${DB_PATH}"
echo "[entrypoint] OMNIROUTE_MEMORY_MB=${OMNIROUTE_MEMORY_MB}"

mkdir -p "${DATA_DIR}"

# Start keep-alive daemon if present to prevent Render free tier sleeping after 14 mins
if [ -f /app/keepalive.mjs ]; then
  echo "[entrypoint] Starting keep-alive daemon..."
  node /app/keepalive.mjs &
fi

if [ "${LITESTREAM_ENABLED:-true}" = "false" ] || [ -z "${LITESTREAM_BUCKET:-}" ] || [ -z "${LITESTREAM_ACCESS_KEY_ID:-}" ]; then
  echo "[entrypoint] LITESTREAM disabled or env vars not set."
  echo "[entrypoint] Running OmniRoute WITHOUT Litestream replication."
  exec node dev/run-standalone.mjs
fi

# -restore-if-db-not-exists: on cold start (fresh container, no local DB file),
# litestream restores from the R2 replica before starting replication. If no
# replica exists yet (true first boot), it logs "no backup found, starting
# fresh" and continues -- no separate restore step or error handling needed.
echo "[entrypoint] Starting OmniRoute under Litestream replication..."
exec litestream replicate \
  -config /etc/litestream.yml \
  -restore-if-db-not-exists \
  -exec "node dev/run-standalone.mjs"