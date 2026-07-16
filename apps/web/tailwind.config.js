/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#F4F1EA',
        ink: '#1A1814',
        brand: '#0F766E',
        accent: '#1E3A5F',
        ok: '#15803D',
        warn: '#C2410C',
        line: '#E4DFD6',
      },
      fontFamily: {
        sans: ['"Source Sans 3"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(26,24,20,0.05), 0 10px 28px rgba(30,58,95,0.06)',
      },
    },
  },
  plugins: [],
};
