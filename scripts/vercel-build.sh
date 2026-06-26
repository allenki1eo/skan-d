#!/usr/bin/env bash
# Produces Vercel Build Output API format so Vercel ignores the project's
# framework preset ("fastify") and instead reads our explicit config.
# Ref: https://vercel.com/docs/build-output-api/v3
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.vercel/output"

echo "==> [1/4] Building web app..."
yarn workspace @skan-d/web build

echo "==> [2/4] Bundling API with ncc..."
rm -rf "$OUT"
mkdir -p "$OUT/functions/api/index.func"
# ncc compiles TypeScript + bundles all deps into a single index.js.
# Native addons (.node files) are copied automatically alongside it.
npx --yes @vercel/ncc build "$ROOT/api/index.ts" \
  --out "$OUT/functions/api/index.func" \
  --minify \
  --no-cache

echo "==> [3/4] Writing function and route config..."
cat > "$OUT/functions/api/index.func/.vc-config.json" <<'JSON'
{
  "runtime": "nodejs20.x",
  "handler": "index.js",
  "launcherType": "Nodejs",
  "maxDuration": 60,
  "memory": 1024
}
JSON

cat > "$OUT/config.json" <<'JSON'
{
  "version": 3,
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index" },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
JSON

echo "==> [4/4] Copying static web assets..."
mkdir -p "$OUT/static"
cp -r "$ROOT/apps/web/dist/." "$OUT/static/"

echo ""
echo "Build Output API ready at $OUT"
echo "  static/:   $(du -sh "$OUT/static" | cut -f1)"
echo "  functions: $(du -sh "$OUT/functions" | cut -f1)"
