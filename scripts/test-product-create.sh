#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="producttest$(date +%s)@test.local"
PASSWORD="password123"
SLUG="prodshop$(date +%s)"

curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"Test\",\"last_name\":\"User\"}" > /dev/null

curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null

curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Prod Test\",\"slug\":\"$SLUG\"}" > /dev/null

# Mimic exactly what inventory page sends
echo "=== POST /api/products with page payload (no category_id, empty category string) ==="
RES=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"UI Test Product","sku":"","price":1000,"cost_price":500,"qty":5,"unit":"pcs","category":"","description":null,"low_stock_threshold":5}')
echo "  $RES"

echo "=== POST /api/products with category_id (real uuid) ==="
# Create a category first
CAT=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Cat","color":"#fff","icon":"📦"}')
echo "  cat: $CAT"
CAT_ID=$(echo "$CAT" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

RES=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"UI Test Product 2\",\"sku\":\"\",\"price\":1000,\"cost_price\":500,\"qty\":5,\"unit\":\"pcs\",\"category_id\":\"$CAT_ID\",\"description\":null,\"low_stock_threshold\":5}")
echo "  $RES"