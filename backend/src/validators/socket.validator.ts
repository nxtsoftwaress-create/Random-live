import { z } from "zod";

export const matchModeSchema = z.enum(["video", "text"]);
export type MatchMode = z.infer<typeof matchModeSchema>;

export const roomIdSchema = z
  .string()
  .regex(/^room_[a-f0-9]{12}$/, "Invalid room id");

export const queueJoinSchema = z.object({
  mode: matchModeSchema,
  language: z.string().min(2).max(12).default("en"),
  interests: z.array(z.string().min(1).max(24)).max(10).default([]),
});

export const chatMessageSchema = z.object({
  roomId: roomIdSchema,
  body: z.string().min(1).max(1000), // hard cap; content rules applied in chat.service
});

export const mediaStateSchema = z.object({
  roomId: roomIdSchema,
  audioMuted: z.boolean(),
  videoMuted: z.boolean(),
});

export const signalingSchema = z.object({
  roomId: roomIdSchema,
  sdp: z.string().min(1).max(20_000), // SDP size cap
});

export const iceCandidateSchema = z.object({
  roomId: roomIdSchema,
  candidate: z.unknown().nullable(), // RTCIceCandidateInit | null (end-of-candidates)
});

export const roomIdOnlySchema = z.object({ roomId: roomIdSchema });

export type QueueJoinInput = z.infer<typeof queueJoinSchema>;
