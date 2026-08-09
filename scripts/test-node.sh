#!/usr/bin/env bash
# Logic that can be checked without a device or a network:
#
#   ./scripts/test-node.sh
#
# Both suites are plain Node with type stripping — no test runner, no bundler.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> public page rendering"
node --experimental-strip-types --no-warnings \
  "$REPO/supabase/functions/public-pages/render.test.ts"

echo
echo "==> notification emails"
node --experimental-strip-types --no-warnings \
  "$REPO/supabase/functions/send-notifications/email.test.ts"

echo
echo "==> outbox error classification"
node --experimental-strip-types --no-warnings \
  "$REPO/mobile/lib/outbox-errors.test.ts"
