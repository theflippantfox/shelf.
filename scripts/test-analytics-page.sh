#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="ap$(date +%s)@test.local"
PASSWORD="password123"
SLUG="ap$(date +%s)"

rm -f /tmp/c.jar
curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"A\",\"last_name\":\"P\"}" > /dev/null
curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5173/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5173/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"AP Shop\",\"slug\":\"$SLUG\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5173/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5173/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"theme":"system","primary_color":"#7B4F8A","sidebar_bg":"#150F1C"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5173/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5173/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

# Product: cost 1000, price 1500
P1=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5173/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","price":1500,"cost_price":1000,"qty":50}')
P1_ID=$(echo "$P1" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

# Sell 10 units
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5173/api/sales \
  -H "Content-Type: application/json" \
  -d "{\"payment_method\":\"cash\",\"subtotal\":15000,\"total\":15000,\"items\":[{\"productId\":\"$P1_ID\",\"qty\":10,\"name\":\"Test\",\"sku\":\"T1\",\"unitPrice\":1500}]}" > /dev/null

# Now change the product's cost to 5000 to simulate a post-sale cost change
echo "PATCH response:"
curl -sS -b /tmp/c.jar -X PATCH "http://127.0.0.1:5173/api/products/$P1_ID" \
  -H "Content-Type: application/json" -d '{"cost_price": 5000}'
echo ""

# Verify the snapshot is set
COST=$(docker exec supabase_db_shelf psql -U postgres -d postgres -t -c "select cost_at_sale from sale_items where product_id='$P1_ID' order by id desc limit 1;" | tr -d ' ')
LIVE=$(docker exec supabase_db_shelf psql -U postgres -d postgres -t -c "select cost_price from products where id='$P1_ID';" | tr -d ' ')
echo "Snapshot cost_at_sale: $COST  |  Live product cost: $LIVE"

echo ""
echo "=== /api/analytics endpoint ==="
curl -sS -b /tmp/c.jar "http://127.0.0.1:5173/api/analytics" | python3 -c "
import json, sys
d = json.load(sys.stdin)
gp = d['analytics']['grossProfit']
print('grossProfit.current:', gp.get('current'))
print('  expected: 5000 (revenue 15000 - cogs 10000 from snapshot cost 1000 x qty 10)')
if gp.get('current') == 5000:
    print('  ✓ snapshot working')
else:
    print('  ✗ WRONG')
"