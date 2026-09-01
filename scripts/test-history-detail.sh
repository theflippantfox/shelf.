#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="histhit$(date +%s)@test.local"
PASSWORD="password123"
SLUG="hist$(date +%s)"

# Setup
curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"H\",\"last_name\":\"I\"}" > /dev/null

curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null

curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"H Shop\",\"slug\":\"$SLUG\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"theme":"system","primary_color":"#7B4F8A","sidebar_bg":"#150F1C"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

# Create a product + sale
P1=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","price":1000,"cost_price":400,"qty":10}')
P1_ID=$(echo "$P1" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

SALE=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/sales \
  -H "Content-Type: application/json" \
  -d "{\"payment_method\":\"cash\",\"subtotal\":2000,\"total\":2000,\"items\":[{\"productId\":\"$P1_ID\",\"qty\":2,\"name\":\"Test\",\"sku\":\"T1\",\"unitPrice\":1000}]}")
SALE_ID=$(echo "$SALE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
echo "sale id: $SALE_ID"

echo "=== API GET /api/sales/\$SALE_ID ==="
curl -sS -b /tmp/c.jar "http://127.0.0.1:5180/api/sales/$SALE_ID" | python3 -m json.tool | head -20

echo "=== Page GET /history/\$SALE_ID ==="
CODE=$(curl -sS -b /tmp/c.jar -o /tmp/page.html -w "%{http_code}" "http://127.0.0.1:5180/history/$SALE_ID")
echo "  HTTP $CODE"
head -20 /tmp/page.html