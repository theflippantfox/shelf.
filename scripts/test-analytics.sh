#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="analyticstest$(date +%s)@test.local"
PASSWORD="password123"
SLUG="analyticsshop$(date +%s)"

curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"A\",\"last_name\":\"B\"}" > /dev/null

curl -sS -b /tmp/c.jar -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null

curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" -d "{\"name\":\"A Shop\",\"slug\":\"$SLUG\"}" > /dev/null

curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"IN","currency_code":"INR","timezone":"Asia/Kolkata","currency_symbol":"₹","currency_locale":"en-IN","date_format":"YYYY-MM-DD","time_format":"24h","tax_rate":0,"tax_inclusive":false,"tax_name":"GST"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" -d '{"theme":"system","primary_color":"#7B4F8A","sidebar_bg":"#150F1C"}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" -d '{"invites":[]}' > /dev/null
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" -d '{"categories":[]}' > /dev/null

# Create a product
P1=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","price":1000,"cost_price":400,"qty":50}')
P1_ID=$(echo "$P1" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
echo "product id: $P1_ID"

# Make 3 sales
for i in 1 2 3; do
  S=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/sales \
    -H "Content-Type: application/json" \
    -d "{\"payment_method\":\"cash\",\"subtotal\":2000,\"total\":2000,\"items\":[{\"productId\":\"$P1_ID\",\"qty\":2,\"name\":\"Widget\",\"sku\":\"WID\",\"unitPrice\":1000}]}")
  echo "  sale $i: $(echo $S | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('id') or d.get('error'))")"
done

echo ""
echo "=== Analytics API response shape ==="
curl -sS -b /tmp/c.jar http://127.0.0.1:5180/api/analytics > /tmp/an.json
python3 << 'EOF'
import json
with open('/tmp/an.json') as f:
    d = json.load(f)
a = d.get('analytics', {})
print(f"  revenue.current: {a['kpis']['revenue']['current']}")
print(f"  revenue.sparkline: {a['kpis']['revenue']['sparkline']}")
print(f"  transactions.current: {a['kpis']['transactions']['current']}")
print(f"  hourly: {a['hourly'][:3]} ... ({len(a['hourly'])} buckets)")
print(f"  weekday: {a['weekday']}")
print(f"  trend points: {len(a['trend'])}")
if a['trend']:
    print(f"  trend[0]: {a['trend'][0]}")
    nonzero = [p for p in a['trend'] if p['current'] > 0]
    print(f"  trend with current>0: {len(nonzero)}")
print(f"  products.byRevenue[:2]: {a['products']['byRevenue'][:2]}")
print(f"  categories[:2]: {a['categories'][:2]}")
print(f"  monthlyTrend len: {len(a['monthlyTrend'])}")
print(f"  monthlyTrend sums: {[(p['label'], p['revenue']) for p in a['monthlyTrend']]}")
print(f"  grossProfit: {a['grossProfit']}")
print(f"  stockValue: {a['stockValue']}")
EOF