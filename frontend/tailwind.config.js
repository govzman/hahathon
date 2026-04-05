/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Share Tech Mono"', 'Courier New', 'monospace'],
        title: ['"Russo One"', 'Impact', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
