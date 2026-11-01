#!/bin/sh
# Static files for the deployment. Schedule JSON is left out on purpose:
# /data.json and /parish/:id.json are rewritten to api/schedule and api/parish,
# which read the latest copy. A filesystem file would win over that rewrite.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
cd public
find . -type d ! -path './parish' ! -path './parish/*' | while read -r d; do
  mkdir -p "../dist/$d"
done
find . -type f ! -name 'data.json' ! -path './parish/*' | while read -r f; do
  cp "$f" "../dist/$f"
done
