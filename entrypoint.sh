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

echo "[entrypoint] DATA_DIR=${DATA_DIR}"
echo "[entrypoint] Database=${DB_PATH}"

mkdir -p "${DATA_DIR}"

if [ -z "${LITESTREAM_BUCKET:-}" ] || [ -z "${LITESTREAM_ACCESS_KEY_ID:-}" ]; then
  echo "[entrypoint] LITESTREAM_BUCKET / LITESTREAM_ACCESS_KEY_ID not set."
  echo "[entrypoint] Skipping Litestream -- running OmniRoute WITHOUT replication."
  echo "[entrypoint] Data will NOT survive a Render restart. Set the Litestream"
  echo "[entrypoint] env vars to enable persistence."
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