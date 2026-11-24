/**
 * Per-route document metadata (title / description / Open Graph / canonical).
 *
 * The app is a client-rendered SPA, so this runs on first paint and on every
 * navigation. It only ever *updates* tags it owns — the old implementation
 * wiped every <meta> in <head>, including the viewport tag, which broke layout
 * on mobile.
 */

const BASE_URL = "https://random-live.vercel.app";

interface RouteMeta {
  title: string;
  description: string;
}

const DEFAULT_META: RouteMeta = {
  title: "Random Live — Meet people. Talk. Connect.",
  description:
    "Meet people through one-to-one random video and text chat. Matched in seconds, no signup needed. 18+.",
};

const ROUTES: Record<string, RouteMeta> = {
  "/": {
    title: "Free Random Video Chat with Strangers | Random Live",
    description:
      "Start a one-to-one random video chat with strangers in your browser. Free, no signup, matched in seconds. 18+.",
  },
  "/safety": {
    title: "Video Chat Safety, Privacy & Reporting | Random Live",
    description:
      "Age requirements, reporting, blocking and moderation on Random Live — plus how little data we keep by design.",
  },
  "/guest": {
    title: "Start Video Chat as Guest — No Signup | Random Live",
    description:
      "Instant guest access: no account, no email, no verification. Full features with a temporary anonymous profile.",
  },
  "/permissions": {
    title: "Camera & Microphone Check | Random Live",
    description:
      "Check your camera and microphone before your first random video chat. Text chat works without devices.",
  },
  "/preferences": {
    title: "Chat Preferences — Language & Interests | Random Live",
    description:
      "Pick video or text chat, your language and interests so Random Live can match you with someone compatible.",
  },
  "/matchmaking": {
    title: "Finding Your Match | Random Live",
    description: "Random Live is matching you with someone. Matching widens after ten seconds so you are never stuck.",
  },
  "/live": {
    title: "Live Video Chat | Random Live",
    description: "You are in a live random chat on Random Live. Skip, mute or end at any time.",
  },
};

// Routes that should not be indexed (in-call and in-flow views).
const NOINDEX_ROUTES = new Set(["/live", "/matchmaking", "/permissions", "/preferences"]);

function setMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function applyRouteSeo(pathname: string): void {
  const meta = ROUTES[pathname] ?? DEFAULT_META;
  const url = `${BASE_URL}${pathname === "/" ? "/" : pathname}`;

  document.title = meta.title;
  setMeta("name", "description", meta.description);
  setMeta("property", "og:title", meta.title);
  setMeta("property", "og:description", meta.description);
  setMeta("property", "og:type", "website");
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:card", "summary");
  setMeta("name", "twitter:title", meta.title);
  setMeta("name", "twitter:description", meta.description);
  setMeta("name", "robots", NOINDEX_ROUTES.has(pathname) ? "noindex,follow" : "index,follow");
  setCanonical(url);
}
