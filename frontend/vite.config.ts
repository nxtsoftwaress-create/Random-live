import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const PUBLISHER_RE = /ca-pub-\d{16}/;

/**
 * Google AdSense wiring that must happen at build time:
 *  - the account meta tag Google checks during site verification, and
 *  - ads.txt, which ad buyers read to authorize this publisher.
 *
 * index.html already declares the publisher, so its tags are never duplicated;
 * with no publisher id at all the build stays byte-identical to a
 * non-monetized one.
 */
function adsensePlugin(clientId: string): Plugin {
  return {
    name: "adsense",
    transformIndexHtml(html) {
      if (!clientId) return html;
      return {
        html,
        tags: [
          ...(html.includes('name="google-adsense-account"')
            ? []
            : [
                {
                  tag: "meta",
                  attrs: { name: "google-adsense-account", content: clientId },
                  injectTo: "head" as const,
                },
              ]),
          ...(html.includes("pagead2.googlesyndication.com")
            ? []
            : [
                {
                  tag: "link",
                  attrs: { rel: "preconnect", href: "https://pagead2.googlesyndication.com" },
                  injectTo: "head" as const,
                },
              ]),
        ],
      };
    },
    closeBundle() {
      if (!clientId) return;
      // ads.txt wants the bare `pub-…` id, not the `ca-` prefix.
      const publisher = clientId.replace(/^ca-/, "");
      try {
        writeFileSync(
          fileURLToPath(new URL("./dist/ads.txt", import.meta.url)),
          `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`,
        );
      } catch {
        /* no dist output (dev server) — nothing to write */
      }
    },
  };
}

const indexHtml = (() => {
  try {
    return readFileSync(fileURLToPath(new URL("./index.html", import.meta.url)), "utf8");
  } catch {
    return "";
  }
})();

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Env wins, then whatever index.html already declares — one publisher id for
  // the page, the ad units and ads.txt.
  const fromEnv = (env.VITE_ADSENSE_CLIENT_ID ?? "").trim();
  const fromHtml = indexHtml.match(PUBLISHER_RE)?.[0] ?? "";
  const validClientId = PUBLISHER_RE.test(fromEnv) ? fromEnv : fromHtml;

  return {
    plugins: [react(), adsensePlugin(validClientId)],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: "http://localhost:5000", changeOrigin: true },
        "/socket.io": { target: "http://localhost:5000", ws: true },
      },
    },
    build: {
      sourcemap: true,
    },
  };
});
