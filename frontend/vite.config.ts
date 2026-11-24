import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

/**
 * Google AdSense wiring that must happen at build time:
 *  - the account meta tag Google checks during site verification, and
 *  - ads.txt, which ad buyers read to authorize this publisher.
 *
 * Both are skipped when no publisher id is configured, so the build stays
 * byte-identical to a non-monetized one.
 */
function adsensePlugin(clientId: string): Plugin {
  return {
    name: "adsense",
    transformIndexHtml(html) {
      if (!clientId) return html;
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { name: "google-adsense-account", content: clientId },
            injectTo: "head",
          },
          {
            tag: "link",
            attrs: { rel: "preconnect", href: "https://pagead2.googlesyndication.com" },
            injectTo: "head",
          },
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const clientId = (env.VITE_ADSENSE_CLIENT_ID ?? "").trim();
  const validClientId = /^ca-pub-\d{16}$/.test(clientId) ? clientId : "";

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
