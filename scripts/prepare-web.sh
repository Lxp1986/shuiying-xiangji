#!/usr/bin/env bash
# 仅打包可部署的静态文件（排除 node_modules）
# Functions 与 D1 由项目根 wrangler.toml + functions/ 一并部署
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist-web"
rm -rf "$OUT"
mkdir -p "$OUT/icons"
cp "$ROOT/index.html" "$ROOT/styles.css" "$ROOT/report.css" \
  "$ROOT/app.js" "$ROOT/auth.js" "$ROOT/report.js" \
  "$ROOT/manifest.webmanifest" "$ROOT/sw.js" "$OUT/"
cp "$ROOT/icons/"*.png "$OUT/icons/"
echo "Prepared $OUT"
