/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0F172A',
        },
        lime: {
          DEFAULT: '#84CC16',
          50: '#F7FEE7',
          100: '#ECFCCB',
          200: '#D9F99D',
          500: '#84CC16',
          600: '#65A30D',
          700: '#4D7C0F',
          soft: 'rgba(132,204,22,.12)',
          line: 'rgba(132,204,22,.32)',
        },
        ember: {
          DEFAULT: '#F97316',
          100: '#FFEDD5',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          soft: 'rgba(249,115,22,.12)',
        },
        azure: {
          DEFAULT: '#3B82F6',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          soft: 'rgba(59,130,246,.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      maxWidth: {
        shell: '1120px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.45', transform: 'scale(.82)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .7s cubic-bezier(.4,0,.2,1) both',
        'pulse-dot': 'pulse-dot 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
