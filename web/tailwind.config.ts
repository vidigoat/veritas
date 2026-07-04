import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFEB", panel: "#FFFFFF", ink: "#1A1A1A", "ink-60": "#6B6960", "ink-30": "#D8D5C6",
        line: "#EDEBDD", green: "#1F6F54", "green-t": "#E9F3EE", amber: "#C77D28", "amber-t": "#FBF1E3",
        crimson: "#C4322E", "crimson-t": "#FAEAE9", gold: "#C9A227", "gold-t": "#F8F1DC", brand: "#2F5EA8",
      },
      fontFamily: { serif: ["var(--font-garamond)", "Georgia", "serif"], sans: ["var(--font-figtree)", "system-ui", "sans-serif"], mono: ["var(--font-mono)", "monospace"] },
      borderRadius: { chip: "8px", control: "12px", card: "20px", section: "32px" },
    },
  },
  plugins: [],
} satisfies Config;
