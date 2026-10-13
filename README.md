# Random Live 🎲📡

**Meet people. Talk. Connect.** A production-shaped random video/text chat platform (Omegle-class) built as a monorepo: peer-to-peer WebRTC media, Redis-backed matchmaking, PostgreSQL session records, and a dark neon glass frontend.

```
Landing → Rules/Age Gate → Guest → Permissions → Preferences → Matchmaking
        → WebRTC (video/audio) + Live Text → NEXT → Re-match → Session End
```

## Architecture

```
┌─────────────────────┐        REST /api/v1 ────┐
│  React + Vite + TS  │◄──── Socket.IO ─────────┤
│  Tailwind · Zustand │                         │
│  WebRTC · Framer    │   WebRTC media (P2P)    │
└─────────┬───────────┘      A ◄────────► B     │
          │                             │      │
          ▼                             ▼      ▼
┌──────────────────────────────────────────────────┐
│        Node.js + Express + Socket.IO (TS)        │
│   Auth │ Matchmaking │ Signaling │ Chat │ REST   │
└──────────┬──────────────────────────┬────────────┘
           ▼                          ▼
     PostgreSQL (Prisma)          Redis 7
   users · sessions · messages   queues · presence · rooms · limits
                                        │
                              STUN (direct) / TURN (relay fallback)
```

**Key design decisions**

- **Media never touches the backend.** The server relays SDP/ICE only; audio/video flows
  peer-to-peer via WebRTC (STUN first, TURN relay as fallback).
- **Redis is ephemeral state only** — matchmaking queues, presence, live room state, rate
  limits. PostgreSQL is the source of truth for users, sessions and messages.
- **Perfect negotiation** (`peer.ts` / role A impolite, role B polite) makes offer glare a
  non-issue regardless of who connects first.
- **Guests are real user rows**, so reports/blocks/bans (next phase) FK cleanly without
  migrating session data.
- Anti-rematch windows, language widening after 10 s wait, interest-overlap scoring, and
  presence-TTL queue hygiene keep the queue healthy.

## Quickstart

**Prerequisites:** Node ≥ 20. For the data layer, either Docker (recommended), local
Postgres 16 + Redis 7 — or nothing at all, thanks to the in-memory fallback below.

```bash
# 1. Infrastructure (Postgres + Redis)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # defaults work with the compose file
npm install
npm run prisma:generate
npm run db:migrate            # applies prisma/migrations
npm run dev                   # REST + Socket.IO on :5000

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env          # empty values = use Vite dev proxy
npm install
npm run dev                   # http://localhost:5173
```

Open **two browsers** (or one normal + one incognito), click **Start Chat**, and you'll be
talking to yourself in seconds — the full loop: match → live A/V + chat → NEXT → re-match.

### Running without Docker

The backend probes Postgres and Redis at boot and falls back to in-memory equivalents of
the same `DataStore` / `RedisLike` interfaces, so every code path works with no services
at all — data is simply ephemeral. Skip step 1 and `db:migrate`, and the boot log will
print `Storage: db=memory redis=memory`; `GET /api/v1/health` reports `dbMode`/`redisMode`.

| `PERSISTENCE` | Behaviour |
| ------------- | --------- |
| `auto` (default) | Probe both; use Postgres/Redis when reachable, otherwise memory |
| `memory` | Force ephemeral memory stores — ideal for demos and CI |
| `real` | Require live services; fail fast if either is unreachable |

> TURN: for reliable connections behind symmetric NATs/corporate firewalls, add free
> [Metered OpenRelay](https://www.metered.ca/tools/openrelay/) credentials to both
> `.env` files (`TURN_URL` / `TURN_USERNAME` / `TURN_PASSWORD`), or self-host coturn:
> `docker compose --profile turn up -d` (config in `infrastructure/coturn/`).

## Scripts

| Where   | Command              | What it does                          |
| ------- | -------------------- | ------------------------------------- |
| backend | `npm run dev`        | tsx watch — REST + Socket.IO + ticker |
| backend | `npm run typecheck`  | strict TS check                       |
| backend | `npm test`           | vitest unit suites (29 tests)         |
| backend | `npm run test:integration` | full 2-client loop vs real services |
| backend | `npm run db:migrate` | `prisma migrate deploy`               |
| backend | `npm run db:studio`  | Prisma Studio                         |
| frontend| `npm run dev`        | Vite dev server with API proxy        |
| frontend| `npm run build`      | typecheck + production bundle         |
| frontend| `npm run preview`    | serve the production build            |

## Project structure

```
random-live/
├── backend/
│   ├── prisma/                  # schema + initial migration
│   ├── src/
│   │   ├── config/              # env (Zod), prisma, redis, cors
│   │   ├── controllers/         # auth, user, session, health
│   │   ├── middleware/          # auth, rateLimit, errorHandler
│   │   ├── services/            # auth, presence, matchmaking (+ pairing core),
│   │   │                        # session lifecycle, chat, rate limiting
│   │   ├── websocket/           # socket bootstrap + matchmaking/webrtc/chat handlers
│   │   ├── validators/          # Zod schemas (REST + every socket payload)
│   │   ├── utils/               # logger, jwt, errors, ids
│   │   ├── app.ts               # Express assembly
│   │   └── server.ts            # HTTP + Socket.IO boot, graceful shutdown
│   └── tests/                   # unit tests + gated integration test
├── frontend/
│   └── src/
│       ├── components/          # Background, VideoTile, ChatBox, ui/*
│       ├── pages/               # Landing → Safety → Guest → Permissions →
│       │                        # Preferences → Matchmaking → LiveRoom
│       ├── store/               # zustand: auth, settings, room state machine
│       ├── webrtc/              # configuration, media, peer, signaling
│       ├── websocket/           # managed socket singleton
│       ├── hooks/               # useSocket, useMatchmaking, useMediaDevices, useAudioLevel
│       ├── services/            # axios + auth/user APIs
│       ├── router/              # routes + flow-step guards
│       └── types/               # shared payload types (mirror backend)
├── infrastructure/coturn/       # self-hosted TURN config
└── docker-compose.yml           # postgres + redis (+ coturn profile)
```

## Socket protocol (v1)

| Client → Server      | Payload                                  |
| -------------------- | ---------------------------------------- |
| `queue_join`         | `{ mode, language, interests[] }` (+ack) |
| `queue_leave`        | —                                        |
| `next_user`          | `{ roomId }` — ends session, both requeue |
| `call_ended`         | `{ roomId }` — graceful end              |
| `webrtc_offer` / `webrtc_answer` | `{ roomId, sdp }` (size-capped) |
| `webrtc_ice_candidate` | `{ roomId, candidate }`                |
| `chat_message`       | `{ roomId, body }` (+ack)                |
| `typing_start/stop`  | `{ roomId }`                             |
| `media_state`        | `{ roomId, audioMuted, videoMuted }`     |
| `heartbeat`          | — (keeps presence alive)                 |

| Server → Client    | Payload                                        |
| ------------------ | ---------------------------------------------- |
| `match_found`      | `{ roomId, role: "a"\|"b", mode, partner }`    |
| `partner_left`     | `{ reason: "next"\|"ended"\|"disconnect" }`    |
| `session_ended`    | `{ roomId, reason: "next"\|"ended" }`          |
| `chat_message`     | `{ id, senderId, body, createdAt }`            |
| `chat_error` / `socket_error` | `{ code, message }`                 |
| `search_started` / `search_cancelled` | search lifecycle acks     |

Auth: every socket handshake carries `auth.token` (JWT access token); invalid tokens are
rejected before any handler runs. Every signaling/chat payload is room-authorized
server-side.

## Security (MVP baseline)

JWT access (2 h) + refresh (30 d) rotation · Socket.IO handshake auth · Zod validation on
REST **and** every socket event · room membership authorization on all relays · Helmet +
locked CORS · REST rate limits (IP) + Redis flood control on chat (5 msg / 5 s) · chat URL
filter + profanity filter · 1 MB socket frame cap · size-capped SDP · unguessable room ids
· graceful session teardown with `endReason` audit trail.

**Planned hardening (phase 7):** httpOnly-cookie refresh storage, CSRF tokens, automated
media moderation, device fingerprinting, TURN credential TTLs, CSP.

## Testing

- **Unit (always run):** matchmaking pairing (language, widening, exclusion, interest
  scoring), chat content validation, JWT issuance/rotation, display-name generation.
- **Integration (opt-in, needs services):** two real socket clients run the full loop —
  guest → match → chat → next. `npm run test:integration` in `backend/`.
- **Manual matrix:** Chrome↔Firefox, mobile↔desktop, Wi-Fi↔LTE, camera-denied paths,
  TURN-relay connections (watch the "Relay (TURN)" badge in the room).

## Roadmap (per the architecture doc)

1. ✅ **MVP core loop** — this build
2. **Safety phase** — reports, blocks, bans, moderation queue (schema seams already exist)
3. **Accounts** — email/password or OAuth upgrade of guest rows, profiles
4. **Admin dashboard** — live sessions, reports queue, audit logs, analytics
5. **Scale-out** — Redis adapter for Socket.IO, matchmaker leader election, TURN fleet,
   Prometheus/Grafana metrics

## Deployment notes

- **Frontend:** Vercel / Cloudflare Pages (`VITE_API_URL` + `VITE_SOCKET_URL` → your API).
- **Backend:** any long-lived container host (Render / Railway / Fly.io / ECS). Do **not**
  host Socket.IO on serverless platforms.
- **Data:** managed Postgres + Redis.
- **TURN:** small VM with coturn; UDP 3478 + 49152-65535 open. TURN bandwidth is your
  biggest cost at scale — direct P2P is the happy path (the UI badge shows which one
  you're on).

---

*Built with the Codebuff agent — Buffy.* 🤖
