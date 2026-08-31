#!/usr/bin/env bash
# scripts/supabase-keepalive.sh
# ─────────────────────────────────────────────────────────────────────
# Pings the Supabase project daily so the free tier doesn't pause after
# 7 days of inactivity. Only runs when an external (Cloud) Supabase
# project is configured; the local stack doesn't need this.
#
# Set CLOUD_SUPABASE_URL and CLOUD_SUPABASE_ANON_KEY in /etc/environment
# (or your CI env) before installing the cron job.
#
# Install:
#   sudo cp scripts/supabase-keepalive.sh /usr/local/bin/
#   sudo chmod 755 /usr/local/bin/supabase-keepalive.sh
#   sudo tee /etc/cron.d/supabase-keepalive <<'EOF'
#   0 6 * * * root /usr/local/bin/supabase-keepalive.sh >> /var/log/supabase-keepalive.log 2>&1
#   EOF
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

URL="${CLOUD_SUPABASE_URL:-}"
KEY="${CLOUD_SUPABASE_ANON_KEY:-}"

if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "$(date -Iseconds) SKIP: CLOUD_SUPABASE_URL or CLOUD_SUPABASE_ANON_KEY not set"
  exit 0
fi

# ── Health check (lightweight, no DB query) ──
HEALTH=$(curl -fsS -o /dev/null -w "%{http_code}" \
  -H "apikey: $KEY" \
  "$URL/auth/v1/health" 2>/dev/null || echo "000")

# ── Rest API ping (forces a tiny bit of traffic so the free tier sees activity) ──
PING=$(curl -fsS -o /dev/null -w "%{http_code}" \
  -H "apikey: $KEY" \
  "$URL/rest/v1/" 2>/dev/null || echo "000")

# ── Storage ping (each subsystem counts toward activity) ──
STORAGE=$(curl -fsS -o /dev/null -w "%{http_code}" \
  -H "apikey: $KEY" \
  "$URL/storage/v1/bucket" 2>/dev/null || echo "000")

if [ "$HEALTH" = "200" ] && [ "$PING" = "200" ]; then
  echo "$(date -Iseconds) OK    health=$HEALTH rest=$PING storage=$STORAGE"
  exit 0
else
  echo "$(date -Iseconds) FAIL  health=$HEALTH rest=$PING storage=$STORAGE"
  exit 1
fi