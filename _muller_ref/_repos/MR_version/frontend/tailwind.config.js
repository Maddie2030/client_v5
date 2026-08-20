/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          50: "#f3efe7", 100: "#e8e2d7", 200: "#d5cfc4", 300: "#b7b2aa",
          400: "#96949a", 500: "#777981", 600: "#5b606a", 700: "#454b56",
          800: "#2a303a", 900: "#1d222a", 950: "#111419",
        },
        brand: {
          50: "#fff2ed", 100: "#ffdcd2", 200: "#ffc0b1", 300: "#f6a08e",
          400: "#ef806c", 500: "#e66b58", 600: "#c75243", 700: "#a64138",
          800: "#7a342f", 900: "#552822", 950: "#351c1b",
        },
        gold: {
          400: "#e8b96a",
        },
      },
    },
  },
  plugins: [],
};
