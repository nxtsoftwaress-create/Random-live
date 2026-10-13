import { randomBytes } from "node:crypto";

/** Opaque, unguessable room id: room_ + 12 hex chars. */
export function newRoomId(): string {
  return `room_${randomBytes(6).toString("hex")}`;
}
