/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#09131f",
        mist: "#eff5f8",
        slate: "#5d7285",
        tide: "#0d7c86",
        leaf: "#1b9c85",
        amber: "#f5a524",
        coral: "#ff6f61"
      },
      boxShadow: {
        panel: "0 18px 60px rgba(9, 19, 31, 0.12)"
      },
      fontFamily: {
        sans: ["'Avenir Next'", "'Segoe UI'", "'Noto Sans'", "system-ui", "sans-serif"],
        display: ["'Trebuchet MS'", "'Avenir Next'", "'Segoe UI'", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
