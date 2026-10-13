/**
 * Full-loop integration test — REQUIRES real Postgres + Redis:
 *
 *   docker compose up -d
 *   cd backend && npm run db:migrate
 *   npm run test:integration
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type http from "node:http";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { buildServer } from "../../src/server.js";
import { startMatchmaker, stopMatchmaker } from "../../src/services/matchmaking.service.js";
import { initStores } from "../../src/config/store.js";
import type { Server as IoServer } from "socket.io";

let httpServer: http.Server;
let io: IoServer;
let baseUrl: string;
let port = 0;

interface GuestResponse {
  user: { id: string; displayName: string };
  accessToken: string;
  refreshToken: string;
}

function connectClient(token: string, url: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(url, {
      auth: { token },
      transports: ["websocket"],
      timeout: 5000,
    });
    client.on("connect", () => resolve(client));
    client.on("connect_error", (err) => reject(err));
  });
}

function waitFor<T>(client: ClientSocket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeAll(async () => {
  await initStores(); // probe real services; falls back to memory if absent
  const server = buildServer();
  httpServer = server.httpServer;
  io = server.io;
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (address && typeof address === "object") port = address.port;
  baseUrl = `http://127.0.0.1:${port}`;
  startMatchmaker();
});

afterEach(async () => {
  io.disconnectSockets(true);
});

async function createGuestViaRest(): Promise<GuestResponse> {
  const res = await fetch(`${baseUrl}/api/v1/auth/guest`, { method: "POST" });
  if (!res.ok) throw new Error(`guest failed: ${res.status}`);
  return (await res.json()) as GuestResponse;
}

describe("guest → match → chat → next flow", () => {
  it("runs the complete MVP loop", async () => {
    // 1. Two guests register over REST
    const [a, b] = await Promise.all([createGuestViaRest(), createGuestViaRest()]);
    expect(a.accessToken).toBeTruthy();
    expect(b.user.id).not.toBe(a.user.id);

    // 2. Both connect via Socket.IO with their access token
    const [socketA, socketB] = await Promise.all([
      connectClient(a.accessToken, baseUrl),
      connectClient(b.accessToken, baseUrl),
    ]);

    // 3. Both join the video queue
    const foundA = waitFor<{ roomId: string; role: string; partner: { id: string } }>(socketA, "match_found");
    const foundB = waitFor<{ roomId: string; role: string; partner: { id: string } }>(socketB, "match_found");
    socketA.emit("queue_join", { mode: "video", language: "en", interests: ["gaming"] }, () => {});
    socketB.emit("queue_join", { mode: "video", language: "en", interests: ["gaming"] }, () => {});

    const [matchA, matchB] = await Promise.all([foundA, foundB]);
    expect(matchA.roomId).toBe(matchB.roomId);
    expect(matchA.partner.id).toBe(b.user.id);
    expect(matchB.partner.id).toBe(a.user.id);
    expect([matchA.role, matchB.role].sort()).toEqual(["a", "b"]);

    // 4. A sends a chat message, B receives it
    const gotMessage = waitFor<{ senderId: string; body: string }>(socketB, "chat_message");
    await new Promise<void>((resolve, reject) => {
      socketA.emit("chat_message", { roomId: matchA.roomId, body: "Hello from A!" }, (res: { ok: boolean }) => {
        res?.ok ? resolve() : reject(new Error("chat ack not ok"));
      });
    });
    const message = await gotMessage;
    expect(message.body).toBe("Hello from A!");
    expect(message.senderId).toBe(a.user.id);

    // 5. A presses Next → B is told the partner left, A gets session_ended
    const endedA = waitFor<{ roomId: string; reason: string }>(socketA, "session_ended");
    const leftB = waitFor<{ reason: string }>(socketB, "partner_left");
    socketA.emit("next_user", { roomId: matchA.roomId });
    const [ended, left] = await Promise.all([endedA, leftB]);
    expect(ended.reason).toBe("next");
    expect(left.reason).toBe("next");

    socketA.close();
    socketB.close();
  }, 20000);
});
