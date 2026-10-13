import type { Server } from "socket.io";

let io: Server | null = null;

export function setIo(server: Server): void {
  io = server;
}

export function getIo(): Server {
  if (!io) throw new Error("Socket.IO server not initialized yet");
  return io;
}

/** Like getIo but tolerant — for code paths that can run before boot (tests). */
export function maybeIo(): Server | null {
  return io;
}

export const roomChannel = (roomId: string): string => `room:${roomId}`;
