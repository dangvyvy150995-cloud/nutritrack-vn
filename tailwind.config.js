/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f1f7f2', 100: '#dcebdf', 200: '#bad7c0', 300: '#8fbc99', 400: '#649d72', 500: '#4a8259', 600: '#396846', 700: '#2f5339', 800: '#284330', 900: '#213729' },
        accent: { 50: '#fff6ed', 100: '#ffead4', 200: '#fdd1a8', 300: '#fbb072', 400: '#f6893f', 500: '#ef6c1c', 600: '#d95512' },
        ink: { 50: '#f6f7f7', 100: '#e3e5e6', 200: '#c7cbcd', 300: '#a2a8ac', 400: '#7c8489', 500: '#61696e', 600: '#4c5257', 700: '#3e4347', 800: '#2f3336', 900: '#1f2224' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)' },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
