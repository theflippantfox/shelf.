#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="chart$(date +%s)@test.local"
PASSWORD="password123"
SLUG="chart$(date +%s)"

rm -f /tmp/c.jar
curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"C\",\"last_name\":\"H\"}" > /dev/null
curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"CH Shop\",\"slug\":\"$SLUG\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"theme":"system","primary_color":"#7B4F8A","sidebar_bg":"#150F1C"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

# A product
P1=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Chart Test","price":1500,"cost_price":1000,"qty":50}')
P1_ID=$(echo "$P1" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

# A few sales
for i in 1 2 3 4 5; do
  curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/sales \
    -H "Content-Type: application/json" \
    -d "{\"payment_method\":\"cash\",\"subtotal\":1500,\"total\":1500,\"items\":[{\"productId\":\"$P1_ID\",\"qty\":1,\"name\":\"Chart Test\",\"sku\":\"CT\",\"unitPrice\":1500}]}" > /dev/null
done

echo "=== Page /analytics ==="
CODE=$(curl -sS -b /tmp/c.jar -o /tmp/analytics.html -w "%{http_code}" "http://127.0.0.1:5180/analytics")
echo "  HTTP $CODE"
if [ "$CODE" = "200" ]; then
  echo "  page rendered OK"
  echo "  contains AreaChart canvas: $(grep -c '<canvas' /tmp/analytics.html)"
  echo "  contains DonutChart canvas: $(grep -c 'donut' /tmp/analytics.html || echo 0)"
fi
echo ""
echo "=== Page / ==="
CODE=$(curl -sS -b /tmp/c.jar -o /tmp/home.html -w "%{http_code}" "http://127.0.0.1:5180/")
echo "  HTTP $CODE"