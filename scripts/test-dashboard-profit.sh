#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="profit$(date +%s)@test.local"
PASSWORD="password123"
SLUG="profit$(date +%s)"

curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"P\",\"last_name\":\"T\"}" > /dev/null

curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null

curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"P Shop\",\"slug\":\"$SLUG\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"NG","currency_code":"NGN","timezone":"Africa/Lagos","currency_symbol":"₦","currency_locale":"en-NG","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"VAT"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"theme":"system","primary_color":"#7B4F8A","sidebar_bg":"#150F1C"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

# Create product: cost 1000, price 1500 (like the user's case)
P1=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","price":1500,"cost_price":1000,"qty":50}')
P1_ID=$(echo "$P1" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

# Sell 10 units
SALE=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/sales \
  -H "Content-Type: application/json" \
  -d "{\"payment_method\":\"cash\",\"subtotal\":15000,\"total\":15000,\"items\":[{\"productId\":\"$P1_ID\",\"qty\":10,\"name\":\"Test\",\"sku\":\"T1\",\"unitPrice\":1500}]}")
echo "sale: $(echo $SALE | python3 -c "import sys, json; print(json.load(sys.stdin).get('sale_ref'))")"

# Hit the dashboard
echo ""
echo "=== Home page load ==="
curl -sS -b /tmp/c.jar http://127.0.0.1:5180/ > /tmp/home.html
# Look for the profit number in the page
grep -E "profit|Profit|revenue|Revenue" /tmp/home.html | head -3 || echo "(no inline match - page is hydrated)"

# Look at __SVELTEKIT_DATA__ for actual values
python3 -c "
import json, re
with open('/tmp/home.html') as f: html = f.read()
m = re.search(r'data=\"([^\"]*?)\"', html)
if m:
    pass
# Look for sveltekit data island
m = re.search(r'__sveltekit_data[^>]*>([^<]*)<', html)
if m:
    data = m.group(1)
    print('SVELTEKIT_DATA:', data[:500])
"
# Try sveltekit data app script
python3 << 'EOF'
import re, json
with open('/tmp/home.html') as f: html = f.read()
# Find data in the app script
m = re.search(r'\{"type":"data","data":(\{[^}]*?\}),"form":', html)
if m:
    print('data island:', m.group(1)[:500])
EOF