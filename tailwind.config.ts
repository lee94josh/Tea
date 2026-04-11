import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tea: {
          50: "#faf7f2",
          100: "#f2ebe0",
          200: "#e4d5c0",
          300: "#d2b896",
          400: "#bd9569",
          500: "#ad7d50",
          600: "#9f6b44",
          700: "#84563a",
          800: "#6c4633",
          900: "#583b2c",
          950: "#2e1d15",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      spacing: {
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
};

export default config;
