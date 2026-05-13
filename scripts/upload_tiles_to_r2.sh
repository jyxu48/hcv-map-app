#!/bin/zsh

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <bucket-name> <account-id>"
  exit 1
fi

BUCKET_NAME="$1"
ACCOUNT_ID="$2"
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$APP_ROOT"

for TILESET in tracts tract_centroids cbsas; do
  s5cmd \
    --profile r2 \
    --endpoint-url "https://${ACCOUNT_ID}.r2.cloudflarestorage.com" \
    --numworkers 512 \
    --stat \
    --log error \
    cp \
    --exclude ".DS_Store" \
    --content-type application/x-protobuf \
    --content-encoding gzip \
    --cache-control "public, max-age=31536000, immutable" \
    "data/tiles/${TILESET}/" "s3://${BUCKET_NAME}/data/tiles/${TILESET}/"
done
