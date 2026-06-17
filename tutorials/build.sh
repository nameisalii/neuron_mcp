#!/usr/bin/env bash
# Render one tutorial: capture frames then encode to MP4 (matches example: 1120x760, 30fps, h264).
set -euo pipefail
cd "$(dirname "$0")"

V="${1:?usage: build.sh <slack|linear|gmail|notion>}"
OUTNAME="${2:-connect-$V}"

export PW_CHROMIUM="/Users/alinazarov/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"

node capture.mjs "$V"

FF="$(command -v ffmpeg)"

"$FF" -y -framerate 30 -i "frames/$V/%04d.png" \
  -vf "scale=2240:1520:flags=lanczos,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -crf 18 -movflags +faststart \
  "out/$OUTNAME.mp4" >/dev/null 2>&1

echo "wrote out/$OUTNAME.mp4"
ls -la "out/$OUTNAME.mp4"
