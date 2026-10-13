import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#000000",
        ink: "#0a0a0a",
        panel: "#141414",
        brand: {
          DEFAULT: "#d94148",
          light: "#e05a60",
          dark: "#b62e35",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Sora", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(217,65,72,.45)",
        "glow-white": "0 0 20px rgba(255,255,255,.25)",
        "glow-lg": "0 0 60px rgba(217,65,72,.35)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
