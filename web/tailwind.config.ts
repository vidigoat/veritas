import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // pure-white neutral system
        white: "#FFFFFF", cream: "#FAFAF9", bone: "#F4F4F2", stone: "#ECECE9",
        hairline: "#E8E8E5", line: "#EFEFED",
        ink: "#111111", "ink-70": "#57574F", "ink-50": "#8A8A82", "ink-30": "#B9B9B2",
        // fire (primary action) · ice (data/citations) · crimson (fraud) · nvidia
        fire: "#EA580C", "fire-pale": "#FEF1E8",
        ice: "#0B69C7", "ice-pale": "#EAF3FC",
        crimson: "#C0182A", "crimson-pale": "#FBECEE",
        nvidia: "#76B900", "nvidia-pale": "#F1F8E6",
        gold: "#B7791F", "gold-pale": "#FBF4E6",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["DM Sans", "-apple-system", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { chip: "6px", control: "10px", card: "14px", composer: "18px" },
      boxShadow: {
        card: "0 1px 2px rgba(17,17,17,0.03), 0 1px 3px rgba(17,17,17,0.04)",
        lift: "0 1px 2px rgba(17,17,17,0.04), 0 12px 40px rgba(17,17,17,0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
