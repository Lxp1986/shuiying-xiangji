#!/usr/bin/env bash
# Cloudflare Web：仅水印相机（不含施工报告 / Word）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist-web"
rm -rf "$OUT"
mkdir -p "$OUT/icons"
# 仅水印相关静态资源
cp "$ROOT/index.html" "$ROOT/styles.css" \
  "$ROOT/app.js" "$ROOT/auth.js" \
  "$ROOT/manifest.webmanifest" "$ROOT/sw.js" "$OUT/"
cp "$ROOT/icons/"*.png "$OUT/icons/"
# 确保不带入报告模块
rm -f "$OUT/report.js" "$OUT/report.css" "$OUT/office.html"
echo "Prepared watermark-only web bundle → $OUT"
