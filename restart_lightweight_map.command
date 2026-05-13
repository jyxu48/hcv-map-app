#!/bin/zsh

set -euo pipefail

APP_ROOT="/Users/jinyang/Desktop/processing/tract_map_app_lossless"
PORT="8011"
URL="http://localhost:${PORT}/web/"
LOG_FILE="${APP_ROOT}/map_server.log"
PID_FILE="${APP_ROOT}/map_server.pid"

echo "Restarting lightweight map on port ${PORT}..."

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}")"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    kill "${OLD_PID}" 2>/dev/null || true
    sleep 1
  fi
  rm -f "${PID_FILE}"
fi

EXISTING_PIDS="$(lsof -tiTCP:${PORT} -sTCP:LISTEN || true)"
if [[ -n "${EXISTING_PIDS}" ]]; then
  echo "${EXISTING_PIDS}" | xargs kill 2>/dev/null || true
  sleep 1
fi

cd "${APP_ROOT}"
nohup python3 "${APP_ROOT}/scripts/serve_local.py" --port "${PORT}" > "${LOG_FILE}" 2>&1 &
NEW_PID=$!
echo "${NEW_PID}" > "${PID_FILE}"

for _ in {1..20}; do
  if curl -sfI "${URL}" >/dev/null 2>&1; then
    open "${URL}"
    echo "Lightweight map is running at ${URL}"
    exit 0
  fi
  sleep 0.5
done

echo "The server started, but the page did not respond in time."
echo "Check log: ${LOG_FILE}"
exit 1
