/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        bg: "#F9F8F6",
        surface: "#FFFFFF",
        ink: "#1C1C19",
        ink2: "#5C5C54",
        primary: "#D95D39",
        primaryHover: "#B84A2C",
        secondary: "#2A4747",
        secondaryHover: "#1F3535",
        accent: "#E6B89C",
        line: "#E5E5E0",
        danger: "#D32F2F",
        success: "#2E7D32",
      },
      fontFamily: {
        heading: ['"Cabinet Grotesk"', "sans-serif"],
        body: ['"IBM Plex Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
