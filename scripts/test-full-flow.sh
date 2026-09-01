#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="fullex$(date +%s)@test.local"
PASSWORD="password123"
SLUG="fullshop$(date +%s)"

echo "=== Signup + onboarding ==="
REG=$(curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"Test\",\"last_name\":\"User\"}")
echo "  register: $REG"

curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null

SHOP=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Full Shop\",\"slug\":\"$SLUG\"}")
echo "  shop: $SHOP"
SHOP_ID=$(echo "$SHOP" | python3 -c "import sys, json; print(json.load(sys.stdin)['shopId'])")

echo "=== Create products ==="
P1=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Product 1\",\"price\":100,\"cost_price\":50,\"qty\":10}")
echo "  P1: $P1"
P1_ID=$(echo "$P1" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

P2=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Product 2\",\"price\":200,\"cost_price\":100,\"qty\":5}")
echo "  P2: $P2"
P2_ID=$(echo "$P2" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

echo "=== Create sale (atomic) ==="
SUBTOTAL=400
TOTAL=400
SALE=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/sales \
  -H "Content-Type: application/json" \
  -d "{\"payment_method\":\"cash\",\"subtotal\":$SUBTOTAL,\"total\":$TOTAL,\"items\":[{\"productId\":\"$P1_ID\",\"qty\":2,\"name\":\"Test Product 1\",\"sku\":\"TEST-7332\",\"unitPrice\":100},{\"productId\":\"$P2_ID\",\"qty\":1,\"name\":\"Test Product 2\",\"sku\":\"TEST-2903\",\"unitPrice\":200}]}")
echo "  SALE: $SALE"

echo "=== Verify stock decremented ==="
STOCK=$(curl -sS -b /tmp/c.jar http://127.0.0.1:5180/api/products)
echo "  Products after sale:"
echo "$STOCK" | python3 -c "import sys, json; [print(f'    {p[\"name\"]}: qty={p[\"qty\"]}') for p in json.load(sys.stdin)]"

curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" \
  -d '{"theme":"system","primary_color":"#7B4F8A","sidebar_bg":"#150F1C"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

echo "=== Hit other pages ==="
for path in / /inventory /history /customers /restocking /analytics /sale /settings/categories /settings/team; do
  CODE=$(curl -sS -b /tmp/c.jar -o /dev/null -w "%{http_code}" "http://127.0.0.1:5180$path")
  echo "  $path → $CODE"
done