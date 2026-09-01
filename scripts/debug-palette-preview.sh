#!/usr/bin/env bash
# Test that the live preview actually updates the DOM by:
# 1. Loading /settings/appearance
# 2. Checking the initial --primary CSS var value
# 3. Clicking a different palette via the bundled JS
# 4. Checking the --primary value changed

# This is a SSR test only — we can't actually click in bash.
# But we can check that the JS bundle includes applyShopPalette.

set -e
cd "$(dirname "$0")/.."

EMAIL="lp$(date +%s)@test.local"
PASSWORD="password123"
SLUG="lp$(date +%s)"

rm -f /tmp/c.jar
curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"L\",\"last_name\":\"P\"}" > /dev/null
curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"LP Shop\",\"slug\":\"$SLUG\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"primary_color":"#0B0B0F","sidebar_bg":"#0B0B0F","theme":"system","palette_id":"graphite-mint"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

echo "=== Loading /settings/appearance ==="
HTTP=$(curl -sS -b /tmp/c.jar -o /tmp/appearance.html -w "%{http_code}" http://127.0.0.1:5180/settings/appearance)
echo "  HTTP: $HTTP"

echo "=== JS bundle paths ==="
grep -oE "/@fs/[^']*settings/appearance[^']*|/_app/[^']*appearance[^']*" /tmp/appearance.html | head -3

echo "=== Fetch JS chunks ==="
for chunk in $(grep -oE "/_app/[^\"' ]*\.js" /tmp/appearance.html | head -5); do
  echo "  $chunk"
done

echo
echo "=== Check for applyShopPalette in the JS chunks ==="
TOTAL_HITS=0
for chunk in $(grep -oE "/_app/[^\"' ]*\.js" /tmp/appearance.html | sort -u); do
  HITS=$(curl -sS "http://127.0.0.1:5180$chunk" 2>/dev/null | grep -c "applyShopPalette" || true)
  if [ "$HITS" -gt 0 ]; then
    echo "  $chunk: $HITS"
    TOTAL_HITS=$((TOTAL_HITS + HITS))
  fi
done
echo "  total applyShopPalette references: $TOTAL_HITS"
