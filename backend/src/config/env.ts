import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.preprocess(
    (v) => (v === undefined || v === "" || v === "0" ? undefined : v),
    z.coerce.number().int().positive().default(5000),
  ),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  /** auto: probe + fall back to memory | memory: force in-memory | real: require live services */
  PERSISTENCE: z.enum(["auto", "memory", "real"]).default("auto"),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),

  CLIENT_URL: z.string().url().default("http://localhost:5173"),

  STUN_SERVERS: z
    .string()
    .default("stun:stun.cloudflare.com:3478,stun:stun.l.google.com:19302"),
  TURN_URL: z.string().optional().default(""),
  TURN_USERNAME: z.string().optional().default(""),
  TURN_PASSWORD: z.string().optional().default(""),

  MATCH_TICK_MS: z.coerce.number().int().positive().default(300),
  MATCH_WIDEN_MS: z.coerce.number().int().positive().default(10_000),
  RECENT_PARTNER_TTL_MS: z.coerce.number().int().positive().default(1_800_000),
});

// Empty-string env vars (PORT="" etc.) must count as unset, not as values.
const cleanedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ""),
);

const parsed = schema.safeParse(cleanedEnv);
if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === "production",
  isDev: raw.NODE_ENV === "development",
  clientOrigins: raw.CLIENT_URL.split(",").map((s) => s.trim()).filter(Boolean),
  stunServers: raw.STUN_SERVERS.split(",").map((s) => s.trim()).filter(Boolean),
  turn: raw.TURN_URL
    ? { url: raw.TURN_URL, username: raw.TURN_USERNAME, credential: raw.TURN_PASSWORD }
    : null,
};

export type Env = typeof env;
