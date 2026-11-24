/**
 * Regression tests for the crash that took the instance down with "Exited with
 * status 1": one rejected promise from an async Express handler or a Socket.IO
 * handler used to become an unhandled rejection, which Node turns into a
 * process exit.
 */
import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import type http from "node:http";
import { asyncHandler } from "../src/utils/asyncHandler.js";
import { errorHandler, notFoundHandler } from "../src/middleware/errorHandler.js";
import { onSafe } from "../src/websocket/safe.js";

describe("asyncHandler", () => {
  const app = express();
  app.get("/boom", asyncHandler(async () => {
    throw new Error("database exploded");
  }));
  app.get("/ok", asyncHandler(async (_req, res) => {
    res.json({ ok: true });
  }));
  app.use(notFoundHandler);
  app.use(errorHandler);

  let server: http.Server | undefined;
  let base = "";

  const start = async (): Promise<string> => {
    if (base) return base;
    server = app.listen(0, "127.0.0.1");
    const started = server;
    await new Promise<void>((resolve) => started.once("listening", resolve));
    const address = started.address();
    const port = address && typeof address === "object" ? address.port : 0;
    base = `http://127.0.0.1:${port}`;
    return base;
  };

  afterAll(() => {
    server?.close();
  });

  it("turns a rejected async route into a 500, not an unhandled rejection", async () => {
    const url = await start();
    const res = await fetch(`${url}/boom`);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "internal" } });

    // The process is still serving after the failure.
    const healthy = await fetch(`${url}/ok`);
    expect(healthy.status).toBe(200);
  });
});

describe("onSafe", () => {
  interface FakeSocket {
    data: { user: { id: string } };
    on: (event: string, handler: (...args: unknown[]) => unknown) => void;
    emit: (event: string, payload: unknown) => void;
  }

  function fakeSocket(): { socket: FakeSocket; fire: (event: string, ...args: unknown[]) => void; emitted: Array<{ event: string; payload: unknown }> } {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const socket: FakeSocket = {
      data: { user: { id: "usr_test" } },
      on: (event, handler) => void handlers.set(event, handler),
      emit: (event, payload) => void emitted.push({ event, payload }),
    };
    return {
      socket,
      fire: (event, ...args) => void handlers.get(event)?.(...args),
      emitted,
    };
  }

  it("swallows a throwing handler and reports it to the client", async () => {
    const { socket, fire, emitted } = fakeSocket();
    onSafe(socket as never, "webrtc_offer", async () => {
      throw new Error("bad frame");
    });

    expect(() => fire("webrtc_offer", { roomId: "room_000000000000" })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(emitted).toContainEqual({
      event: "socket_error",
      payload: expect.objectContaining({ code: "internal" }),
    });
  });

  it("still runs successful handlers", async () => {
    const { socket, fire } = fakeSocket();
    let calls = 0;
    onSafe(socket as never, "heartbeat", async () => {
      calls += 1;
    });

    fire("heartbeat");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBe(1);
  });
});
