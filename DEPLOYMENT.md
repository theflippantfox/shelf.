# Shëlf — Production Deployment Guide

**Stack:** SvelteKit app · Directus 11 · PostgreSQL 16 · Nginx · Let's Encrypt SSL  
**Domain:** `theflippantfoxpos.duckdns.org`  
**Host OS:** Ubuntu 22.04 LTS (recommended)

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Server provisioning](#2-server-provisioning)
3. [Initial server hardening](#3-initial-server-hardening)
4. [Install Docker and Docker Compose](#4-install-docker-and-docker-compose)
5. [DuckDNS — point your domain at the server](#5-duckdns--point-your-domain-at-the-server)
6. [Project files on the server](#6-project-files-on-the-server)
7. [Dockerfile for the SvelteKit app](#7-dockerfile-for-the-sveltekit-app)
8. [Environment variables](#8-environment-variables)
9. [Docker Compose](#9-docker-compose)
10. [Nginx configuration](#10-nginx-configuration)
11. [Obtain SSL certificates with Certbot](#11-obtain-ssl-certificates-with-certbot)
12. [Bootstrap Directus — create the schema](#12-bootstrap-directus--create-the-schema)
13. [First deploy and go-live checklist](#13-first-deploy-and-go-live-checklist)
14. [DuckDNS IP auto-updater](#14-duckdns-ip-auto-updater)
15. [Day-2 operations](#15-day-2-operations)
16. [Backups](#16-backups)
17. [Monitoring and logs](#17-monitoring-and-logs)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. Architecture overview

```
Internet (HTTPS :443)
        │
        ▼
   ┌─────────┐
   │  Nginx  │  ← SSL termination, reverse proxy, static cache headers
   └────┬────┘
        │
   ┌────┴──────────────────────┐
   │                           │
   ▼                           ▼
┌──────────┐             ┌──────────────┐
│  Shëlf   │  ──────▶   │   Directus   │  ← headless CMS / admin UI
│(SvelteKit│  internal   │    :8055     │
│  :3000)  │  network    └──────┬───────┘
└──────────┘                    │
                                ▼
                        ┌──────────────┐
                        │  PostgreSQL  │
                        │    :5432     │
                        └──────────────┘

All containers share the Docker network "shelf_net".
PostgreSQL and Directus are NOT exposed to the public internet.
Only ports 80 and 443 are open on the host firewall.
```

**URL routing handled by Nginx:**

| Path | Destination |
|---|---|
| `https://theflippantfoxpos.duckdns.org/*` | SvelteKit app |
| `https://theflippantfoxpos.duckdns.org/directus/*` | Directus admin UI + API |

---

## 2. Server provisioning

Any VPS with a public IPv4 address works. Recommended minimum specs:

| Resource | Minimum | Comfortable |
|---|---|---|
| vCPU | 1 | 2 |
| RAM | 1 GB | 2 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

Good cheap providers: **Hetzner Cloud** (CX21 ~€4/mo), **DigitalOcean** (Basic Droplet $6/mo), **Vultr**, **Linode**.

After provisioning, note the server's **public IPv4 address** — you'll need it for DuckDNS in step 5.

---

## 3. Initial server hardening

SSH into your fresh server as root, then run:

```bash
# Update everything
apt update && apt upgrade -y

# Create a non-root deploy user
adduser deploy
usermod -aG sudo deploy

# Copy your SSH key to the deploy user
# (run this on your LOCAL machine, replacing YOUR_SERVER_IP)
ssh-copy-id deploy@YOUR_SERVER_IP

# Back on the server — disable root SSH login and password auth
nano /etc/ssh/sshd_config
```

Make sure these lines are set in `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
systemctl restart sshd

# Set up UFW firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

From here on, SSH as `deploy` instead of root:

```bash
ssh deploy@YOUR_SERVER_IP
```

---

## 4. Install Docker and Docker Compose

```bash
# Remove any old Docker packages
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Install prerequisites
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key and repository
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Let the deploy user run Docker without sudo
sudo usermod -aG docker deploy

# Log out and back in for the group to take effect
exit
# ssh deploy@YOUR_SERVER_IP again
```

Verify:

```bash
docker --version          # Docker version 26.x.x
docker compose version    # Docker Compose version v2.x.x
```

---

## 5. DuckDNS — point your domain at the server

1. Go to **https://www.duckdns.org** and sign in (GitHub, Google, etc.)
2. In the "domains" section, find **theflippantfoxpos** — it should already exist if you registered it previously. If not, type `theflippantfoxpos` in the "sub domain" box and click **add domain**.
3. Click **update ip** next to `theflippantfoxpos` and paste your server's public IPv4 address, then click **update ip** to confirm.
4. Note your **DuckDNS token** (shown at the top of the page) — you'll need it for the auto-updater in step 14.

Verify DNS propagation (may take a few minutes):

```bash
dig +short theflippantfoxpos.duckdns.org
# Should return your server's IP
```

---

## 6. Project files on the server

```bash
# Create the app directory
sudo mkdir -p /opt/shelf
sudo chown deploy:deploy /opt/shelf
cd /opt/shelf
```

Upload your project from your local machine. The cleanest way is to use `scp` or `rsync` to copy the shelf folder you got from the zip:

```bash
# On YOUR LOCAL MACHINE (in the folder containing the unzipped 'shelf' directory):
rsync -avz --exclude='node_modules' --exclude='.svelte-kit' --exclude='build' \
  shelf/ deploy@YOUR_SERVER_IP:/opt/shelf/
```

Or you can use git if you've pushed the code to a repository:

```bash
# On the server:
cd /opt
git clone https://github.com/YOURNAME/shelf.git shelf
```

Your `/opt/shelf` directory should look like this:

```
/opt/shelf/
├── src/
├── scripts/
├── package.json
├── svelte.config.js
├── vite.config.ts
├── Dockerfile              ← we create this next
├── docker-compose.yml      ← we create this next
├── .env.production         ← we create this next
└── nginx/
    ├── nginx.conf          ← we create this next
    └── conf.d/
        └── shelf.conf      ← we create this next
```

---

## 7. Dockerfile for the SvelteKit app

Create `/opt/shelf/Dockerfile`:

```dockerfile
# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies first (cache-friendly layer)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup -S shelf && adduser -S shelf -G shelf

# Copy only what the server needs
COPY --from=builder --chown=shelf:shelf /app/build       ./build
COPY --from=builder --chown=shelf:shelf /app/node_modules ./node_modules
COPY --from=builder --chown=shelf:shelf /app/package.json ./

USER shelf
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "build"]
```

---

## 8. Environment variables

Create `/opt/shelf/.env.production` — this is **never committed to git**.

```bash
nano /opt/shelf/.env.production
```

Paste the following, filling in every value marked `CHANGE_ME`:

```dotenv
# ── PostgreSQL ────────────────────────────────────────────────────────────────
POSTGRES_DB=shelf
POSTGRES_USER=shelf
POSTGRES_PASSWORD=CHANGE_ME_strong_db_password_here

# ── Directus ──────────────────────────────────────────────────────────────────
# Secret used to sign Directus tokens — generate with:
#   openssl rand -base64 32
DIRECTUS_SECRET=CHANGE_ME_openssl_rand_base64_32

DIRECTUS_ADMIN_EMAIL=admin@theflippantfoxpos.duckdns.org
DIRECTUS_ADMIN_PASSWORD=CHANGE_ME_strong_admin_password

# Static token for the Shëlf app to use — generate with:
#   openssl rand -hex 32
DIRECTUS_ADMIN_TOKEN=CHANGE_ME_openssl_rand_hex_32

# Directus public URL (used by Directus internally for redirects/emails)
DIRECTUS_PUBLIC_URL=https://theflippantfoxpos.duckdns.org/directus

# ── SvelteKit app ─────────────────────────────────────────────────────────────
# Internal Docker network URL — Shëlf talks directly to Directus container
DIRECTUS_URL=http://directus:8055

# Public URL — required by SvelteKit for CSRF protection
ORIGIN=https://theflippantfoxpos.duckdns.org

# The same admin token as above
# (used by the SvelteKit server to call Directus management APIs)
PUBLIC_DIRECTUS_URL=https://theflippantfoxpos.duckdns.org/directus

# ── DuckDNS ───────────────────────────────────────────────────────────────────
DUCKDNS_TOKEN=CHANGE_ME_your_duckdns_token
DUCKDNS_SUBDOMAIN=theflippantfoxpos
```

Generate the random values quickly:

```bash
echo "DIRECTUS_SECRET: $(openssl rand -base64 32)"
echo "DIRECTUS_ADMIN_TOKEN: $(openssl rand -hex 32)"
```

Protect the file:

```bash
chmod 600 /opt/shelf/.env.production
```

---

## 9. Docker Compose

Create `/opt/shelf/docker-compose.yml`:

```yaml
services:

  # ── PostgreSQL ────────────────────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: shelf_postgres
    restart: unless-stopped
    env_file: .env.production
    environment:
      POSTGRES_DB:       ${POSTGRES_DB}
      POSTGRES_USER:     ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - shelf_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout:  5s
      retries:  5
    # NOT exposed to the host — only reachable inside shelf_net

  # ── Directus ──────────────────────────────────────────────────────────────
  directus:
    image: directus/directus:11
    container_name: shelf_directus
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env.production
    environment:
      SECRET:            ${DIRECTUS_SECRET}
      ADMIN_EMAIL:       ${DIRECTUS_ADMIN_EMAIL}
      ADMIN_PASSWORD:    ${DIRECTUS_ADMIN_PASSWORD}

      # Database
      DB_CLIENT:         pg
      DB_HOST:           postgres
      DB_PORT:           "5432"
      DB_DATABASE:       ${POSTGRES_DB}
      DB_USER:           ${POSTGRES_USER}
      DB_PASSWORD:       ${POSTGRES_PASSWORD}

      # URLs
      PUBLIC_URL:        ${DIRECTUS_PUBLIC_URL}

      # Extensions directory (mounted volume)
      EXTENSIONS_PATH:   /directus/extensions

      # Reasonable defaults
      RATE_LIMITER_ENABLED:      "true"
      RATE_LIMITER_POINTS:       "50"
      RATE_LIMITER_DURATION:     "1"
      LOG_LEVEL:                 "info"
      LOG_STYLE:                 "pretty"
      CORS_ENABLED:              "true"
      CORS_ORIGIN:               "https://theflippantfoxpos.duckdns.org"
      MAX_PAYLOAD_SIZE:          "10mb"
    volumes:
      - directus_uploads:/directus/uploads
      - directus_extensions:/directus/extensions
    networks:
      - shelf_net
    # NOT exposed to host — Nginx proxies /directus/ to this container

  # ── SvelteKit app ─────────────────────────────────────────────────────────
  shelf:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: shelf_app
    restart: unless-stopped
    depends_on:
      - directus
    env_file: .env.production
    environment:
      NODE_ENV:              production
      PORT:                  "3000"
      ORIGIN:                ${ORIGIN}
      DIRECTUS_URL:          ${DIRECTUS_URL}
      DIRECTUS_ADMIN_TOKEN:  ${DIRECTUS_ADMIN_TOKEN}
      PUBLIC_DIRECTUS_URL:   ${PUBLIC_DIRECTUS_URL}
    networks:
      - shelf_net
    # NOT exposed to host

  # ── Nginx ─────────────────────────────────────────────────────────────────
  nginx:
    image: nginx:1.25-alpine
    container_name: shelf_nginx
    restart: unless-stopped
    depends_on:
      - shelf
      - directus
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - certbot_www:/var/www/certbot:ro
      - certbot_certs:/etc/letsencrypt:ro
    networks:
      - shelf_net

  # ── Certbot (SSL certificate manager) ─────────────────────────────────────
  certbot:
    image: certbot/certbot:latest
    container_name: shelf_certbot
    volumes:
      - certbot_www:/var/www/certbot
      - certbot_certs:/etc/letsencrypt
    # Run manually for first cert, then via cron for renewal
    entrypoint: /bin/sh -c "trap exit TERM; while :; do certbot renew; sleep 12h; done"

  # ── DuckDNS IP updater ─────────────────────────────────────────────────────
  duckdns:
    image: lscr.io/linuxserver/duckdns:latest
    container_name: shelf_duckdns
    restart: unless-stopped
    env_file: .env.production
    environment:
      PUID:       "1000"
      PGID:       "1000"
      TZ:         "Africa/Lagos"          # change to your timezone
      SUBDOMAINS: ${DUCKDNS_SUBDOMAIN}
      TOKEN:      ${DUCKDNS_TOKEN}
      LOG_FILE:   "false"
    volumes:
      - duckdns_config:/config

volumes:
  postgres_data:
  directus_uploads:
  directus_extensions:
  certbot_www:
  certbot_certs:
  duckdns_config:

networks:
  shelf_net:
    driver: bridge
```

---

## 10. Nginx configuration

Create the directory structure:

```bash
mkdir -p /opt/shelf/nginx/conf.d
```

### `/opt/shelf/nginx/nginx.conf`

```nginx
user  nginx;
worker_processes  auto;
error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;

events {
    worker_connections  1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';
    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile           on;
    tcp_nopush         on;
    tcp_nodelay        on;
    keepalive_timeout  65;
    gzip               on;
    gzip_vary          on;
    gzip_types         text/plain text/css application/json application/javascript
                       text/xml application/xml image/svg+xml;

    # Security headers (applied globally)
    add_header X-Frame-Options        "SAMEORIGIN"   always;
    add_header X-Content-Type-Options "nosniff"      always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;

    # Hide nginx version
    server_tokens off;

    # Upload size limit (for Directus file uploads)
    client_max_body_size 50M;

    include /etc/nginx/conf.d/*.conf;
}
```

### `/opt/shelf/nginx/conf.d/shelf.conf`

```nginx
# ── HTTP: redirect all traffic to HTTPS ──────────────────────────────────────
server {
    listen 80;
    server_name theflippantfoxpos.duckdns.org;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ── HTTPS: main server block ──────────────────────────────────────────────────
server {
    listen 443 ssl;
    http2  on;
    server_name theflippantfoxpos.duckdns.org;

    # SSL certificates (filled in after certbot runs)
    ssl_certificate     /etc/letsencrypt/live/theflippantfoxpos.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/theflippantfoxpos.duckdns.org/privkey.pem;

    # Modern SSL config
    ssl_session_timeout    1d;
    ssl_session_cache      shared:SSL:10m;
    ssl_session_tickets    off;
    ssl_protocols          TLSv1.2 TLSv1.3;
    ssl_ciphers            ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS (6 months — only enable once you're sure HTTPS works)
    # add_header Strict-Transport-Security "max-age=15768000" always;

    # ── Directus admin + API ───────────────────────────────────────────────
    location /directus/ {
        proxy_pass         http://directus:8055/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        # Needed for Directus WebSocket subscriptions
        proxy_read_timeout 3600s;

        # Larger buffer for Directus API responses
        proxy_buffer_size         128k;
        proxy_buffers             4 256k;
        proxy_busy_buffers_size   256k;
    }

    # ── SvelteKit app (everything else) ───────────────────────────────────
    location / {
        proxy_pass         http://shelf:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        # Timeouts for slow DB queries on first load
        proxy_connect_timeout  60s;
        proxy_send_timeout     60s;
        proxy_read_timeout     60s;

        # Cache static assets aggressively
        location ~* \.(js|css|woff2|png|svg|ico|webp)$ {
            proxy_pass http://shelf:3000;
            proxy_cache_valid 200 30d;
            add_header Cache-Control "public, max-age=2592000, immutable";
        }
    }
}
```

> **Important:** The HTTPS server block references SSL cert files that don't exist yet. Nginx will fail to start until you complete step 11. We handle this with a bootstrap config below.

---

## 11. Obtain SSL certificates with Certbot

This is a two-phase process: first get the cert with a minimal Nginx config, then switch to the full config.

### Phase A — start Nginx (HTTP-only config is the default)

The project ships with an HTTP-only `nginx/conf.d/shelf.conf` that works immediately.
A separate `nginx/conf.d/shelf-ssl.conf` contains the full HTTPS config — you'll switch
to it after certbot runs. No manual file editing needed yet.

### Phase B — start Nginx and get the cert

```bash
cd /opt/shelf

# Start only postgres, directus, nginx, and certbot for now
docker compose up -d postgres directus nginx certbot

# Wait ~30 seconds for Directus to initialise against Postgres
sleep 30

# Run certbot to obtain the certificate
# (Certbot communicates via the /.well-known/acme-challenge/ path that
#  Nginx is already serving from the certbot_www volume)
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email admin@theflippantfoxpos.duckdns.org \
  --agree-tos \
  --no-eff-email \
  -d theflippantfoxpos.duckdns.org

# You should see: "Congratulations! Your certificate and chain have been saved…"
```

### Phase C — switch to the HTTPS config

```bash
# Swap in the production SSL config (shelf-ssl.conf is already in the project)
cp nginx/conf.d/shelf-ssl.conf nginx/conf.d/shelf.conf

# Test then reload
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

---

## 12. Bootstrap Directus — create the schema

With Directus running, apply the Shëlf schema to create all collections:

```bash
cd /opt/shelf

# Install tsx locally if needed (just for running the script)
npm install --save-dev tsx dotenv

# Load env vars and run the bootstrap script
DIRECTUS_URL=http://localhost:8055 \
DIRECTUS_ADMIN_TOKEN=$(grep DIRECTUS_ADMIN_TOKEN .env.production | cut -d= -f2) \
npx tsx scripts/bootstrap-directus.ts
```

Wait for the output:

```
✅  Directus is reachable.
👤  Authenticated as: admin@theflippantfoxpos.duckdns.org
📦  Creating collections…
  ✓ Collection "shops"
  ✓ Collection "shop_members"
  ✓ Collection "categories"
  ✓ Collection "tags"
  ✓ Collection "products"
  ✓ Collection "customers"
  ✓ Collection "sales"
  ✓ Collection "sale_items"
  ✓ Collection "stock_log"
🔗  Creating relations…
  ...
🎉  Done!
```

> **If Directus isn't on localhost:8055 yet:** Directus is inside Docker but not port-mapped to the host by default in the compose file. For the bootstrap step only, temporarily add `ports: ["8055:8055"]` to the directus service, run `docker compose up -d directus`, bootstrap, then remove the port mapping and restart. Alternatively, run the bootstrap *inside* the container:
>
> ```bash
> docker compose exec directus node -e "
>   const r = await fetch('http://localhost:8055/server/health');
>   console.log(await r.json());
> "
> ```

---

## 13. First deploy and go-live checklist

```bash
cd /opt/shelf

# Build and start everything
docker compose up -d --build

# Watch all logs together
docker compose logs -f
```

Wait until you see Directus log `"Server started"` and the shelf container log `"Listening on 0.0.0.0:3000"`.

### Go-live checklist

Run through this before sharing the URL:

```bash
# 1. All containers are running
docker compose ps
# Every service should show "Up" or "running"

# 2. HTTPS works
curl -I https://theflippantfoxpos.duckdns.org
# Should return HTTP/2 200

# 3. Directus admin is reachable
curl -I https://theflippantfoxpos.duckdns.org/directus/admin
# Should return HTTP/2 200

# 4. SSL certificate is valid
echo | openssl s_client -connect theflippantfoxpos.duckdns.org:443 2>/dev/null \
  | openssl x509 -noout -dates
# notAfter should be ~90 days from now

# 5. Database is healthy
docker compose exec postgres pg_isready -U shelf -d shelf

# 6. Logs show no errors
docker compose logs shelf    | tail -20
docker compose logs directus | tail -20
```

Open `https://theflippantfoxpos.duckdns.org` in your browser and walk through the onboarding wizard.

---

## 14. DuckDNS IP auto-updater

The `duckdns` service in the compose file (using the linuxserver image) already runs on a 5-minute loop and pings the DuckDNS API whenever your server's IP changes. It started with `docker compose up -d`. Verify it's working:

```bash
docker compose logs duckdns
# Should show: "Your IP was set to X.X.X.X"
```

If you prefer a plain cron job instead (no extra container):

```bash
# Add to the deploy user's crontab: (crontab -e)
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=theflippantfoxpos&token=YOUR_TOKEN&ip=" > /tmp/duckdns.log 2>&1
```

---

## 15. Day-2 operations

### Updating the app

After pushing code changes to the server:

```bash
cd /opt/shelf
# If pulling from git:
git pull origin main

# Rebuild and restart only the app container (zero downtime for Directus/Postgres)
docker compose build shelf
docker compose up -d --no-deps shelf

# Watch logs to confirm clean start
docker compose logs -f shelf
```

### Updating Directus

```bash
# Edit docker-compose.yml: change directus/directus:11 to directus/directus:11.x.x
# Always pin to a specific minor version for Directus
nano docker-compose.yml

docker compose pull directus
docker compose up -d --no-deps directus
docker compose logs -f directus
```

### Updating PostgreSQL

PostgreSQL major version upgrades (e.g. 15→16) require a `pg_dumpall` + restore. **Never change the PostgreSQL major version number without a backup.** For minor updates (16.1→16.2), it's safe:

```bash
docker compose pull postgres
docker compose up -d --no-deps postgres
```

### Renewing SSL certificates

Certbot renews automatically (the certbot service runs `certbot renew` every 12 hours). Force a manual renewal test:

```bash
docker compose run --rm certbot renew --dry-run
```

After a real renewal, reload Nginx to pick up the new cert:

```bash
docker compose exec nginx nginx -s reload
```

Add this to root's crontab to auto-reload Nginx after certbot renews:

```bash
sudo crontab -e
# Add:
0 3 * * * docker exec shelf_nginx nginx -s reload
```

---

## 16. Backups

### Automated daily PostgreSQL backup

```bash
# Create backup directory
sudo mkdir -p /opt/backups/postgres
sudo chown deploy:deploy /opt/backups/postgres

# Add to deploy user's crontab (crontab -e):
0 2 * * * docker exec shelf_postgres pg_dump \
  -U shelf shelf \
  | gzip > /opt/backups/postgres/shelf_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz

# Keep only the last 14 days of backups
0 3 * * * find /opt/backups/postgres -name "*.sql.gz" -mtime +14 -delete
```

### Manual backup and restore

```bash
# Backup
docker exec shelf_postgres pg_dump -U shelf shelf | gzip > /tmp/shelf_manual.sql.gz

# Restore (caution: this overwrites all data)
gunzip < /tmp/shelf_manual.sql.gz | docker exec -i shelf_postgres psql -U shelf shelf
```

### Backup Directus uploads

Directus stores uploaded files (e.g., product images) in the `directus_uploads` Docker volume:

```bash
# Backup uploads volume to a tar archive
docker run --rm \
  -v shelf_directus_uploads:/source:ro \
  -v /opt/backups:/backup \
  alpine tar czf /backup/directus_uploads_$(date +%Y%m%d).tar.gz -C /source .
```

### Off-site backup (strongly recommended)

Install `rclone` and configure it with your cloud provider (Backblaze B2 is cheap at ~$0.006/GB/month):

```bash
sudo apt install -y rclone
rclone config   # follow the wizard for your provider

# Add to crontab — syncs /opt/backups to your cloud bucket daily at 3:30am
30 3 * * * rclone sync /opt/backups remote:shelf-backups --log-file /var/log/rclone.log
```

---

## 17. Monitoring and logs

### Real-time logs

```bash
# All services
docker compose logs -f

# Single service
docker compose logs -f shelf
docker compose logs -f directus
docker compose logs -f postgres
docker compose logs -f nginx
```

### Container resource usage

```bash
docker stats --no-stream
```

### Log rotation

Docker logs accumulate indefinitely by default. Add global log rotation in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
```

```bash
sudo systemctl restart docker
```

### Simple uptime check with healthcheck endpoint

Nginx serves the app. A dead-simple external uptime check:

```bash
# Add to crontab for a ping-based alert
*/5 * * * * curl -sf https://theflippantfoxpos.duckdns.org > /dev/null \
  || echo "Shelf is DOWN at $(date)" | mail -s "Shelf alert" you@example.com
```

Or use a free service like [UptimeRobot](https://uptimerobot.com) (HTTP/HTTPS monitor, free tier checks every 5 minutes, sends email/Telegram alerts).

---

## 18. Troubleshooting

### The site returns a 502 Bad Gateway

```bash
# Check if the shelf container is running
docker compose ps

# Check shelf logs for startup errors
docker compose logs --tail=50 shelf

# Most common cause: Directus hasn't started yet
docker compose logs --tail=50 directus
# Wait for "Server started" before shelf can process requests
```

### Directus won't start / database connection refused

```bash
docker compose logs postgres
# Check for: "database system is ready to accept connections"

# Manually test DB connectivity from the Directus container
docker compose exec directus nc -zv postgres 5432
# Should say: "Connection to postgres 5432 port [tcp/postgresql] succeeded!"

# Check the env vars are correct
docker compose exec directus env | grep DB_
```

### SSL certificate errors / Nginx won't start

```bash
# Test the Nginx config
docker compose exec nginx nginx -t

# Check cert files exist
docker compose exec nginx ls -la /etc/letsencrypt/live/theflippantfoxpos.duckdns.org/

# If certs are missing, re-run certbot:
docker compose run --rm certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  --email admin@theflippantfoxpos.duckdns.org \
  --agree-tos --no-eff-email \
  -d theflippantfoxpos.duckdns.org \
  --force-renewal
```

### App keeps redirecting to /onboarding/account after login

This means the SvelteKit app can't reach Directus to load the shop context. Check:

```bash
# 1. Can the shelf container reach directus?
docker compose exec shelf wget -qO- http://directus:8055/server/health

# 2. Is the admin token correct?
docker compose exec shelf env | grep DIRECTUS_ADMIN_TOKEN

# 3. Check the server console for the hooks error log
docker compose logs shelf | grep "shop context lookup failed"
```

### DuckDNS IP not updating

```bash
docker compose logs duckdns

# Or test the API directly
curl "https://www.duckdns.org/update?domains=theflippantfoxpos&token=YOUR_TOKEN&ip="
# Should return "OK"
```

### Out of disk space

```bash
df -h          # check disk usage
docker system df   # see how much Docker is using

# Clean up unused images, stopped containers, dangling volumes
docker system prune -a

# Check the PostgreSQL data volume size
docker run --rm \
  -v shelf_postgres_data:/data:ro \
  alpine du -sh /data
```

### PostgreSQL ran out of memory and was killed

Add memory limits in `docker-compose.yml` under the `postgres` service:

```yaml
deploy:
  resources:
    limits:
      memory: 512M
```

And tune PostgreSQL for low-memory operation by adding to the `postgres` service environment:

```yaml
environment:
  POSTGRES_SHARED_BUFFERS:     128MB
  POSTGRES_EFFECTIVE_CACHE_SIZE: 256MB
  POSTGRES_WORK_MEM:           4MB
```

---

## Quick reference — useful commands

```bash
# Start everything
docker compose up -d

# Stop everything (data is preserved in volumes)
docker compose down

# Rebuild the app after code changes
docker compose build shelf && docker compose up -d --no-deps shelf

# Open a psql shell
docker compose exec postgres psql -U shelf -d shelf

# Open a shell inside the app container
docker compose exec shelf sh

# Tail all logs
docker compose logs -f

# Force SSL renewal
docker compose run --rm certbot renew --force-renewal
docker compose exec nginx nginx -s reload

# Manual DB backup
docker exec shelf_postgres pg_dump -U shelf shelf | gzip > ~/backup_$(date +%Y%m%d).sql.gz
```
