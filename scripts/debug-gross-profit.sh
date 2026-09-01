#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="gp$(date +%s)@test.local"
PASSWORD="password123"
SLUG="gp$(date +%s)"

rm -f /tmp/c.jar
curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"G\",\"last_name\":\"P\"}" > /dev/null
curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"GP Shop\",\"slug\":\"$SLUG\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"theme":"system","primary_color":"#7B4F8A","sidebar_bg":"#150F1C"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

# Product: cost 1000, price 1500
P1=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","price":1500,"cost_price":1000,"qty":50}')
P1_ID=$(echo "$P1" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

# Sell 10 units
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/sales \
  -H "Content-Type: application/json" \
  -d "{\"payment_method\":\"cash\",\"subtotal\":15000,\"total\":15000,\"items\":[{\"productId\":\"$P1_ID\",\"qty\":10,\"name\":\"Test\",\"sku\":\"T1\",\"unitPrice\":1500}]}" > /dev/null

# Change the product's cost to 5000 to simulate a post-sale cost change
curl -sS -b /tmp/c.jar -X PATCH "http://127.0.0.1:5180/api/products/$P1_ID" \
  -H "Content-Type: application/json" -d '{"cost_price": 5000}' > /dev/null

echo ""
echo "=== /api/analytics endpoint ==="
curl -sS -b /tmp/c.jar "http://127.0.0.1:5180/api/analytics" | python3 -c "
import json, sys
d = json.load(sys.stdin)
gp = d['analytics']['grossProfit']
print('API grossProfit.current:', gp.get('current'))
print('  expected: 5000 (revenue 15000 - cogs 10000)')
if gp.get('current') == 5000:
    print('  ✓ API correct')
else:
    print('  ✗ API WRONG')
"

echo ""
echo "=== /analytics page (SSR) ==="
curl -sS -b /tmp/c.jar "http://127.0.0.1:5180/analytics" | python3 -c "
import re, sys
html = sys.stdin.read()
# Find all instances of gross profit display
# The page shows: formatCurrencyCompact(grossProfit.current) — looks like '₹50' or similar
matches = re.findall(r'grossProfit[^<]*|₹[\\d,.]+', html)
print('grossProfit-related substrings in HTML:')
for m in matches[:20]:
    print(' ', m)
# Also search for the 'Gross Profit' section
m = re.search(r'Gross profit[^<]*<[^>]+>([^<]+)', html)
if m:
    print('Gross profit display value:', m.group(1))
# Try to find it via the analytics JSON payload
json_m = re.search(r'\"grossProfit\":\\s*\\{[^}]+\\}', html)
if json_m:
    print('JSON payload:', json_m.group(0)[:300])
"
