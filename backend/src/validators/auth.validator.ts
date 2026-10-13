import { z } from "zod";

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const patchMeSchema = z
  .object({
    language: z.string().min(2).max(12).optional(),
    interests: z.array(z.string().min(1).max(24)).max(10).optional(),
    displayName: z.string().min(2).max(32).optional(),
  })
  .strict();
