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
          400: "#38bdf8",
          500: "#0ea5e9",
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
          teal: "#2dd4bf",
          indigo: "#818cf8",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        surface: "var(--surface)",
        "surface-light": "var(--surface-light)",
        /* Brand gold — matching landing page */
        gold: {
          DEFAULT: "#e5a832",
          light: "#f0c05a",
          dark: "#b8861f",
        },
        /* Backward-compatible alias */
        claw: {
          DEFAULT: "#e5a832",
          400: "#f0c05a",
          500: "#e5a832",
          600: "#b8861f",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) * 0.8)",
        sm: "calc(var(--radius) * 0.6)",
        xl: "calc(var(--radius) * 1.4)",
        "2xl": "calc(var(--radius) * 1.8)",
        "3xl": "calc(var(--radius) * 2.2)",
      },
      fontFamily: {
        sans: ["var(--font-kumbh-sans)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-ojuju)", "var(--font-kumbh-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
