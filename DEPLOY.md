# Deploying Random Live to the internet for free ($0/month)

Put the whole app live — static frontend, one long-lived Node process (REST +
Socket.IO), managed Postgres, managed Redis, optional TURN relay — without paying
anything. Every piece below has a real free tier.

> **Free tiers drift.** This guide reflects what the providers documented in
> **October 2026**, with sources linked throughout. Check the linked pages before
> you commit to a provider.

## The $0 stack

| Piece | Free pick | Why / caveat |
| ----- | --------- | ------------ |
| Frontend | **Cloudflare Pages** | Static asset requests are free and unlimited; 500 builds/month; free HTTPS + custom domain. |
| Backend | **Northflank Developer Sandbox** | Docs describe free compute as **always on — no sleeping**, and its networking supports WebSockets over public ingress. Free tier is limited (2 services, 1 database, 2 cron jobs) and a payment method is required for identity verification. |
| Backend (alt.) | **Render Free Web Service** | Real Node process, WebSockets supported — but it **sleeps after ~15 min without inbound traffic** (≈1 min cold start) and free web services share **750 instance-hours/month**. |
| Backend (alt.) | **Koyeb Free Instance** | 512 MB RAM / 0.1 vCPU, WebSocket support, but **scales to zero after ~1 h idle** and a socket that wakes a sleeping service may only live a few minutes. |
| Postgres | **Neon Free** | 1 GB/project, **no 30-day expiry**; compute scales to zero after ~5 min idle. |
| Redis | **Upstash Free** | 250 MB, 500k commands/month, up to 10 databases. |
| TURN (optional) | **Metered OpenRelay** | 20 GB relayed/month free — plenty for casual use. |

Two traps to avoid:

- **Render's free Postgres expires 30 days after creation** (then a 14-day grace
  period, then deletion). Use Neon, not Render Postgres.
- **React Router uses `BrowserRouter`**, so deep links (`/chat`, …) need a SPA
  fallback on any static host. This repo ships one —
  [`frontend/public/_redirects`](frontend/public/_redirects) — which Cloudflare
  Pages and Netlify read automatically.

Sources: [Render free limits](https://render.com/docs/free) ·
[Render WebSockets](https://render.com/docs/websocket) ·
[Koyeb instances](https://www.koyeb.com/docs/reference/instances) ·
[Koyeb scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero) ·
[Northflank pricing](https://northflank.com/pricing) ·
[Northflank networking](https://northflank.com/docs/v1/application/network/networking-on-northflank) ·
[Neon plans](https://neon.com/docs/introduction/plans) ·
[Upstash Redis pricing](https://upstash.com/pricing/redis) ·
[Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) ·
[Open Relay](https://www.metered.ca/tools/openrelay/).

### Even simpler: no database at all

You can skip Postgres and Redis entirely with `PERSISTENCE=memory`: every code path
runs against in-memory stores, data is wiped on every restart, and you deploy exactly
one backend service. Ideal for a demo. Do this and steps 1–2 below disappear.

## 0. Prerequisites

- This repo pushed to GitHub (it is).
- Accounts: GitHub, plus the services you pick (GitHub/email signup, seconds each).
- Node ≥ 20 locally — only needed if you want to run migrations from your machine.

## 1. Postgres — Neon

1. Create a project at [neon.com](https://neon.com) → copy the **pooled** connection
   string (it ends with `?sslmode=require`). That's your `DATABASE_URL`.
2. Apply the schema once (from this checkout):

   ```bash
   cd backend
   DATABASE_URL="postgresql://…neon.tech/…?sslmode=require" npm run db:migrate
   ```

   (`db:migrate` = `prisma migrate deploy` — idempotent, safe to re-run.)

## 2. Redis — Upstash

1. Create a Redis database at [upstash.com](https://upstash.com) (pick the region
   closest to your backend).
2. Copy the **`rediss://`** URL (TLS). `ioredis` speaks TLS from the URL directly —
   that's your `REDIS_URL`.

## 3. Backend — Render (guided)

1. Render dashboard → **New + → Web Service** → build from your GitHub repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm ci && npm run prisma:generate && npm run build`
   - **Start Command:** `npm run db:migrate && npm start`
     (the free plan has no separate "pre-deploy command", and `migrate deploy` is
     idempotent — alternatively run the migration from your machine, step 1.2)
   - **Instance Type:** Free
   - **Health Check Path:** `/api/v1/health`
3. Environment variables:

   | Key | Value |
   | --- | ----- |
   | `NODE_ENV` | `production` |
   | `PERSISTENCE` | `real` — or `auto` to fall back to memory, `memory` for the no-DB mode |
   | `DATABASE_URL` | from Neon (step 1) |
   | `REDIS_URL` | from Upstash (step 2) |
   | `JWT_ACCESS_SECRET` | `openssl rand -hex 32` |
   | `JWT_REFRESH_SECRET` | `openssl rand -hex 32` |
   | `CLIENT_URL` | your frontend URL (step 4) — comma-separate multiple origins |

4. Deploy and note the service URL (e.g. `https://random-live-api.onrender.com`).
   Render injects `PORT` itself; the app honours it.

**Northflank instead (always-on):** create a project → *Service* → build from GitHub
→ Node buildpack, same build/start commands, port `5000` (or set `PORT`). It needs a
payment method for verification, and free compute resources are limited but do not sleep.

**Koyeb instead:** one free Web Service per org, same commands. Expect cold starts
after an idle hour; the app's socket layer reconnects, so it recovers.

## 4. Frontend — Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Build settings:
   - **Framework preset:** Vite · **Root directory:** `frontend`
   - **Build command:** `npm ci && npm run build` · **Build output:** `dist`
3. Environment variables (Production):

   | Key | Value |
   | --- | ----- |
   | `VITE_API_URL` | `https://random-live-api.onrender.com/api/v1` |
   | `VITE_SOCKET_URL` | `https://random-live-api.onrender.com` |
   | `VITE_STUN_SERVERS` | `stun:stun.cloudflare.com:3478,stun:stun.l.google.com:19302` |
   | `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_PASSWORD` | optional (step 6) |

   These are baked in at **build time** — change one and redeploy.
4. Deploy, then set the backend's `CLIENT_URL` to the exact Pages origin
   (`https://<project>.pages.dev`, plus a custom domain later — comma-separated) and
   redeploy the backend. CORS for **both** REST and Socket.IO is locked to
   `CLIENT_URL`, so this step is what makes the app actually connect.

Vercel/Netlify/anything static also works — just add the equivalent SPA rewrite if
your host ignores `_redirects`.

## 5. Keep the backend awake (Render / Koyeb only)

Free hosts sleep on idle. A GitHub Actions cron or a free UptimeRobot HTTP monitor
poking `/api/v1/health` every ~10 minutes keeps the service warm in practice.

- This does **not** guarantee uptime — restarts, deploys and platform maintenance
  still drop sockets (the client reconnects automatically).
- An always-on Render service uses ~720 of the 750 free instance-hours/month, so a
  second free service in the same workspace will exhaust the pool.
- Northflank's free compute doesn't sleep — no pinging needed.

## 6. TURN relay (optional, but real-world it matters)

Direct P2P works for most networks; symmetric NATs and corporate firewalls need a relay.

- **Free/cloud:** create credentials at
  [Metered OpenRelay](https://dashboard.metered.ca) (20 GB/month free) and set
  `TURN_URL`/`TURN_USERNAME`/`TURN_PASSWORD` on the **backend** and the `VITE_TURN_*`
  pair on the **frontend**, then redeploy both.
- **Self-hosted:** the repo's `docker compose --profile turn up -d` runs coturn — but
  it needs public **UDP 3478 + 49152-65535**, which PaaS web services don't expose.
  Use a VM instead (an Oracle Cloud Always Free VM works; it's also the one free option
  that can run the whole `docker-compose.yml`).

## 7. Verify it's live

```bash
curl https://random-live-api.onrender.com/api/v1/health
# {"status":"ok",...,"dbMode":"postgres","redisMode":"redis"}   ← memory modes here mean the fallback is active
```

Then open the frontend in two browsers (or one normal + one incognito), click
**Start Chat**, and run the loop: age gate → guest → permissions → match → chat →
**Next**. The room shows whether you're on a **direct P2P** or **relay (TURN)**
connection.

First request after idle will be slow on sleeping hosts — that's the cold start, not
a bug.

## 8. Free-tier reality check

| What you're accepting | Effect |
| --------------------- | ------ |
| Sleep / cold start (Render, Koyeb) | First visitor after idle waits ~1 min; open sockets may drop and reconnect. |
| Scale-to-zero DB (Neon) | First query after ~5 min idle is slow — unnoticeable in real use. |
| Ephemeral mode (`PERSISTENCE=memory`) | No DB services, but every restart wipes users/sessions. |
| Quota caps | Upstash 500k commands/month · Render 750 instance-hours/month · Cloudflare Pages 500 builds/month. |
| No SLA | Free tiers are for demos and hobbies. For a real audience, budget ~$7-14/month for an always-on backend and a paid database. |

## 9. Other options, honestly

- **Any long-lived container host works:** a $5 VPS, Oracle Cloud Always Free VM
  (best if you also want coturn), Railway (no longer truly $0 after its trial),
  Fly.io (no free tier for new orgs).
- **Never serverless for Socket.IO** — Vercel/Lambda/Workers can't hold a persistent
  WebSocket-driven process, which is why this architecture uses one long-lived Node
  service.

---

*Last checked: October 2026. Spotted a stale claim? Fix it — it's your repo.*
