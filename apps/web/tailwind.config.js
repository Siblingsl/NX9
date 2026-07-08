/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#FAFAF8',
        ink: '#222222',
        brand: '#A13D63',
        accent: '#5E4D8A',
        ok: '#2E8B57',
        warn: '#D97706',
        line: '#E6E6E6',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 3px rgba(34,34,34,0.06), 0 8px 24px rgba(34,34,34,0.04)',
      },
    },
  },
  plugins: [],
};
