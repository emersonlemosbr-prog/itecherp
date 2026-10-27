/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff8d6',
          100: '#fff1ad',
          200: '#ffe980',
          300: '#ffd74a',
          400: '#ffc806',
          500: '#f6c100',
          600: '#d9a800',
          700: '#b88400',
          800: '#8d6600',
          900: '#6d4d00',
          950: '#4a3600'
        },
        ink: {
          900: '#1C1C1C',
          800: '#232323',
          700: '#333333'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Sora"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 2px 12px -2px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15,23,42,0.06)',
        card: '0 4px 24px -4px rgba(15, 23, 42, 0.10)'
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    },
  },
  plugins: [],
}
