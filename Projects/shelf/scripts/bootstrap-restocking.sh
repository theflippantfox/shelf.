#!/bin/bash

# Load environment variables
if [ -f .env.production ]; then
  export $(grep -v '^#' .env.production | xargs)
fi

if [ -z "$DIRECTUS_URL" ] || [ -z "$DIRECTUS_ADMIN_TOKEN" ]; then
  echo "❌ Missing DIRECTUS_URL or DIRECTUS_ADMIN_TOKEN in .env.production"
  exit 1
fi

echo "🚀 Starting Restocking Feature Schema Setup via API..."

# Helper function to make API calls
call_api() {
  local method=$1
  local endpoint=$2
  local data=$3
  curl -s -X "$method" "$DIRECTUS_URL$endpoint" \
    -H "Authorization: Bearer $DIRECTUS_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$data"
}

# 1. Suppliers
echo "Creating suppliers collection..."
call_api "POST" "/collections" '{
  "collection": "suppliers",
  "schema": {
    "name": { "type": "string", "required": true },
    "contact_name": { "type": "string" },
    "phone": { "type": "string" },
    "email": { "type": "string" },
    "address": { "type": "text" },
    "payment_terms": { "type": "string", "options": { "choices": ["cash", "credit", "net_15", "net_30", "net_60", "consignment"] } },
    "currency_code": { "type": "string", "default": "NGN" },
    "lead_time_days": { "type": "integer" },
    "notes": { "type": "text" },
    "is_active": { "type": "boolean", "default": true }
  }
}'
echo " ✅ Done"

# 2. Purchase Orders
echo "Creating purchase_orders collection..."
call_api "POST" "/collections" '{
  "collection": "purchase_orders",
  "schema": {
    "shop": { "type": "uuid", "required": true },
    "supplier": { "type": "uuid", "required": true },
    "order_ref": { "type": "string", "required": true },
    "status": { "type": "string", "options": { "choices": ["draft", "ordered", "partial", "received", "cancelled"] }, "default": "draft" },
    "order_date": { "type": "date", "required": true },
    "expected_delivery_date": { "type": "date" },
    "received_date": { "type": "date" },
    "subtotal": { "type": "integer", "default": 0 },
    "tax_amount": { "type": "integer", "default": 0 },
    "shipping_cost": { "type": "integer", "default": 0 },
    "total_cost": { "type": "integer", "default": 0 },
    "bill_image": { "type": "uuid" },
    "notes": { "type": "text" },
    "created_by": { "type": "uuid" }
  }
}'
echo " ✅ Done"

# 3. Purchase Order Items
echo "Creating purchase_order_items collection..."
call_api "POST" "/collections" '{
  "collection": "purchase_order_items",
  "schema": {
    "purchase_order": { "type": "uuid", "required": true },
    "product": { "type": "uuid" },
    "product_name": { "type": "string", "required": true },
    "product_sku": { "type": "string" },
    "quantity_ordered": { "type": "integer", "required": true },
    "quantity_received": { "type": "integer", "default": 0 },
    "unit_cost": { "type": "integer", "required": true },
    "line_total": { "type": "integer", "default": 0 },
    "is_new_product": { "type": "boolean", "default": false },
    "notes": { "type": "text" }
  }
}'
echo " ✅ Done"

# 4. Supplier Price History
echo "Creating supplier_price_history collection..."
call_api "POST" "/collections" '{
  "collection": "supplier_price_history",
  "schema": {
    "shop": { "type": "uuid", "required": true },
    "supplier": { "type": "uuid", "required": true },
    "product": { "type": "uuid", "required": true },
    "unit_cost": { "type": "integer", "required": true },
    "currency_code": { "type": "string", "default": "NGN" },
    "purchase_order": { "type": "uuid" },
    "recorded_at": { "type": "timestamp", "default": "now" },
    "notes": { "type": "string" }
  }
}'
echo " ✅ Done"

# 5. Product Batches
echo "Creating product_batches collection..."
call_api "POST" "/collections" '{
  "collection": "product_batches",
  "schema": {
    "shop": { "type": "uuid", "required": true },
    "product": { "type": "uuid", "required": true },
    "purchase_order_item": { "type": "uuid" },
    "batch_number": { "type": "string" },
    "expiry_date": { "type": "date" },
    "quantity_remaining": { "type": "integer", "required": true },
    "date_created": { "type": "timestamp", "default": "now" }
  }
}'
echo " ✅ Done"

# 6. Update products
echo "Updating products collection..."
call_api "PATCH" "/collections/products" '{
  "schema": {
    "reorder_point": { "type": "integer" },
    "preferred_supplier": { "type": "uuid" }
  }
}'
echo " ✅ Done"

# 7. Update stock_log
echo "Updating stock_log collection..."
call_api "PATCH" "/collections/stock_log" '{
  "schema": {
    "purchase_order": { "type": "uuid" }
  }
}'
echo " ✅ Done"

echo "🎉 Restocking schema successfully bootstrapped via API!"
