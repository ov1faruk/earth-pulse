#!/bin/sh
# Refresh the ARCHIVED snapshot of the live feeds (used when upstreams are unreachable).
# Requires the dev server running (npm run dev).
set -e
B=${1:-http://localhost:5173}
mkdir -p public/data/live
for f in quakes events fires "nisar?days=3"; do
  n=${f%%\?*}
  curl -sf --compressed -m 180 -o "public/data/live/$n.json" "$B/api/live/$f"
  echo "$n $(wc -c < public/data/live/$n.json) bytes"
done
