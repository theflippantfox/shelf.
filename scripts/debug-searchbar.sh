#!/usr/bin/env bash
# Test that icons in search bars are positioned correctly
set -e
cd "$(dirname "$0")/.."

EMAIL="icon$(date +%s)@test.local"
PASSWORD="password123"
SLUG="icon$(date +%s)"

rm -f /tmp/c.jar
PORT=5174
curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:$PORT/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"I\",\"last_name\":\"C\"}" > /dev/null
curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:$PORT/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:$PORT/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"Icon Shop\",\"slug\":\"$SLUG\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:$PORT/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:$PORT/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"primary_color":"#0B0B0F","sidebar_bg":"#0B0B0F","theme":"system","palette_id":"graphite-mint"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:$PORT/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:$PORT/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

echo "=== /customers ==="
curl -sS -b /tmp/c.jar http://127.0.0.1:$PORT/customers -o /tmp/cust.html
python3 << 'EOF'
import re
with open('/tmp/cust.html') as f: html = f.read()
# Find the SearchBar (uses lucide-search icon inside a relative div with input)
m = re.search(r'<div class="relative[^"]*">.*?</div>', html, re.DOTALL)
if m:
    print("SearchBar HTML (first 800 chars):")
    print(m.group(0)[:800])
    print()
    # Check icon positioning
    search_icon = re.search(r'class="absolute left-3 top-1/2 -translate-y-1/2[^"]*"', m.group(0))
    print("Search icon class:", search_icon.group(0) if search_icon else "NOT FOUND")
else:
    print("SearchBar not found in HTML")
EOF
