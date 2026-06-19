import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* Semantic tokens — resolve via CSS variables */
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        surface: "var(--surface)",
        "surface-light": "var(--surface-light)",

        /* Gold — brand accent ramp */
        gold: {
          DEFAULT: "#c49428",
          light: "#f5d060",
          dark: "#7a5c18",
          50: "#faf2da",
          100: "#f3e3ad",
          200: "#ecd17f",
          300: "#e8b93a",
          400: "#f5d060",
          500: "#c49428",
          700: "#7a5c18",
          900: "#3a2b0b",
        },

        /* Ink — neutral ramp */
        ink: {
          0: "#fbfbf7",
          100: "#e5e6dd",
          200: "#c8cbbe",
          300: "#8e938a",
          500: "#4a4f49",
          700: "#1f2421",
          800: "#14181a",
          900: "#0a0d0e",
          950: "#06090a",
        },

        /* Functional signals — transaction state (NOT brand) */
        safe: "#3fbe76",
        watch: "#f0b33c",
        danger: "#e5524f",

        /* Backward-compatible alias → gold */
        claw: {
          DEFAULT: "#c49428",
          400: "#f5d060",
          500: "#c49428",
          600: "#7a5c18",
        },
      },
      borderRadius: {
        xs: "var(--r-xs)",        /* 4  — chips */
        sm: "var(--r-sm)",        /* 8  — small controls */
        md: "var(--r-md)",        /* 14 — buttons, inputs, tiles, cards */
        lg: "var(--r-lg)",        /* 22 — big panels / hero surfaces */
        xl: "var(--r-md)",        /* 14 — collapsed: no overshoot past the card radius */
        "2xl": "var(--r-md)",     /* 14 */
        "3xl": "18px",
        pill: "var(--r-pill)",    /* 999 — pills, dots, avatars */
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
