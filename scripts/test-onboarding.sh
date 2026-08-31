#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

EMAIL="onboard$(date +%s)@test.local"
PASSWORD="password123"

echo "1. Register user"
REG=$(curl -sS -c /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"Onboard\",\"last_name\":\"Test\"}")
echo "   REG: $REG"

echo "2. Get session cookie"
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/auth \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -c /tmp/c.jar > /tmp/login.json
echo "   login: $(cat /tmp/login.json)"

echo "3. Create shop via onboarding"
SLUG="testshop$(date +%s)"
SHOP=$(curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/shop \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Shop\",\"slug\":\"$SLUG\"}")
echo "   SHOP: $SHOP"

echo "4. Set locale"
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/locale \
  -H "Content-Type: application/json" \
  -d '{"country_code":"US","currency_code":"USD","currency_symbol":"$","currency_locale":"en-US","timezone":"America/New_York","date_format":"MM/DD/YYYY","time_format":"12h"}' -w "\n   HTTP: %{http_code}\n"

echo "5. Set appearance"
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/appearance \
  -H "Content-Type: application/json" \
  -d '{"primary_color":"#7B4F8A","sidebar_bg":"#150F1C","theme":"dark"}' -w "\n   HTTP: %{http_code}\n"

echo "6. Skip team (no invites)"
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/team \
  -H "Content-Type: application/json" \
  -d '{"invites":[]}' -w "\n   HTTP: %{http_code}\n"

echo "7. Skip categories"
curl -sS -b /tmp/c.jar -X POST http://127.0.0.1:5180/api/onboarding/categories \
  -H "Content-Type: application/json" \
  -d '{"categories":[]}' -w "\n   HTTP: %{http_code}\n"

echo "8. Hit home page"
curl -sS -b /tmp/c.jar -o /dev/null -w "   HTTP: %{http_code}\n" http://127.0.0.1:5180/

echo "$EMAIL" > /tmp/onb_email