/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Eye-friendly educational palette: soft desaturated blue as the
        // primary, muted sage green as a secondary accent, warm (not pure
        // white/black) neutrals for backgrounds and text. Nothing here is
        // fully saturated or neon — every hue is pulled toward gray.
        brand: {
          50: "#f0f5f6",
          100: "#dce9eb",
          200: "#b9d3d8",
          300: "#8fb6bf",
          400: "#65969f",
          500: "#4a7a82",
          600: "#3c636a",
          700: "#325259",
          800: "#2b444a",
          900: "#25383d",
        },
        sage: {
          50: "#f2f6f1",
          100: "#e1ebde",
          300: "#aecaa4",
          500: "#7fa872",
          600: "#658c59",
          700: "#4f6f46",
        },
        accent: {
          400: "#d99c66",
          500: "#c98850",
          600: "#b3743e",
        },
        canvas: {
          DEFAULT: "#faf8f4", // warm off-white, never pure #fff
          card: "#fffdfa",
          sunk: "#f2efe8",
        },
        ink: {
          DEFAULT: "#2e2c28", // warm near-black body text, never pure #000
          soft: "#565349",
          faint: "#84806f",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgba(46, 44, 40, 0.04), 0 1px 3px 0 rgba(46, 44, 40, 0.06)",
      },
    },
  },
  plugins: [],
};
