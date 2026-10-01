import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  // Rutas absolutas: el escaneo funciona igual se ejecute desde la raíz del repo
  // o desde client/.
  darkMode: 'class',
  content: [`${here}index.html`, `${here}src/**/*.{ts,tsx}`],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E63946',
          50: '#FDECEE',
          100: '#FAD5D9',
          200: '#F5AEB5',
          300: '#EF7C87',
          400: '#EA4B59',
          500: '#E63946',
          600: '#CC2B37',
          700: '#A8212B',
          800: '#7F1820',
          900: '#571015',
        },
        ink: {
          DEFAULT: '#171717',
          soft: '#3F3F46',
          muted: '#6B7280',
          faint: '#9CA3AF',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#FAFAFA',
          muted: '#F4F4F5',
          line: '#E8E8EA',
        },
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 23, 23, 0.04)',
        pop: '0 12px 32px -12px rgba(23, 23, 23, 0.18)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.28s ease-out both',
      },
    },
  },
  plugins: [],
};
