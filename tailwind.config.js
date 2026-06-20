/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        'cyber-bg': '#0a0e17',
        'cyber-card': '#0f172a',
        'neon': '#00ff88',
        'cyber-blue': '#0ea5e9',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'neon': '0 0 20px rgba(0, 255, 136, 0.3)',
        'neon-strong': '0 0 30px rgba(0, 255, 136, 0.5)',
        'neon-sm': '0 0 10px rgba(0, 255, 136, 0.2)',
        'cyber-blue': '0 0 20px rgba(14, 165, 233, 0.3)',
      },
    },
  },
  plugins: [],
};
