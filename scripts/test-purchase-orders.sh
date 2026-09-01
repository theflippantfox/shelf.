#!/usr/bin/env bash
# Test purchase order create + list + detail flow.
set -e
cd "$(dirname "$0")/.."

EMAIL="po$(date +%s)@test.local"
PASSWORD="password123"
SLUG="po$(date +%s)"

rm -f /tmp/c.jar

echo "1) Register + onboard"
curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"P\",\"last_name\":\"O\"}" > /dev/null
curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"PO Shop\",\"slug\":\"$SLUG\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"theme":"system","primary_color":"#7B4F8A","sidebar_bg":"#150F1C"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

echo "2) Create a supplier"
SUP=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/suppliers \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Wholesale","contact_name":"John","email":"john@acme.test","phone":"+91-99999-99999","currency_code":"INR","payment_terms":"net_30"}')
SUP_ID=$(echo "$SUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   supplier id: $SUP_ID"

echo "3) Create a product"
P1=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","price":1500,"cost_price":1000,"qty":0}')
P1_ID=$(echo "$P1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   product id: $P1_ID"

echo "4) Create a purchase order"
PO=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/purchase-orders \
  -H "Content-Type: application/json" \
  -d "{\"supplier\":\"$SUP_ID\",\"order_date\":\"2026-09-01\",\"status\":\"ordered\",\"expected_delivery_date\":\"2026-09-10\",\"subtotal\":50000,\"tax_amount\":0,\"shipping_cost\":500,\"notes\":\"Test PO\"}")
PO_ID=$(echo "$PO" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   po id: $PO_ID"

echo "5) Add line item to PO"
curl -sS -b /tmp/c.jar -X POST "http://127.0.0.1:5180/api/purchase-orders/$PO_ID/items" \
  -H "Content-Type: application/json" \
  -d "{\"product_id\":\"$P1_ID\",\"product_name\":\"Widget\",\"product_sku\":\"WID-001\",\"quantity_ordered\":50,\"unit_cost\":1000}" > /dev/null

echo "6) LIST purchase orders"
LIST=$(curl -sS -b /tmp/c.jar http://127.0.0.1:5180/api/purchase-orders)
COUNT=$(echo "$LIST" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "   $COUNT PO(s) in list"
if [ "$COUNT" = "1" ]; then
  echo "   ✓ list contains the new PO"
else
  echo "   ✗ expected 1 PO, got $COUNT"
  echo "$LIST" | head
  exit 1
fi

echo "7) GET PO by id"
DETAIL=$(curl -sS -b /tmp/c.jar "http://127.0.0.1:5180/api/purchase-orders/$PO_ID")
echo "   order_ref: $(echo "$DETAIL" | python3 -c "import sys,json; print(json.load(sys.stdin)['order_ref'])")"

echo "8) /restocking/orders page renders"
HTTP=$(curl -sS -b /tmp/c.jar -o /dev/null -w "%{http_code}" http://127.0.0.1:5180/restocking/orders)
echo "   HTTP $HTTP"
if [ "$HTTP" = "200" ]; then
  echo "   ✓ page returns 200"
else
  echo "   ✗ page failed"
  exit 1
fi

echo ""
echo "=== ALL CHECKS PASSED ==="
