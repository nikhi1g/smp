/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        foreground: "var(--fg)",
        accent: "var(--acc)",
        muted: "var(--sub)",
        border: "var(--border)",
        card: "var(--card-bg)",
      },
    },
  },
  plugins: [],
}
