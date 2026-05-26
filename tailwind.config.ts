import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0A2E52',
          steel: '#1B6FC8',
          'steel-light': '#E6F1FB',
          'warm-white': '#F8F7F5',
          gold: '#B08D4E',
          'text-mid': '#4A4A4A',
          'text-muted': '#7A7A7A',
          'rule-gray': '#D8D6D0',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'Georgia', 'serif'],
      },
      boxShadow: {
        'cla-card': '0 1px 0 rgba(255,255,255,0.7) inset, 0 18px 50px -24px rgba(10, 46, 82, 0.35)',
        'cla-card-hover': '0 1px 0 rgba(255,255,255,0.85) inset, 0 24px 60px -28px rgba(10, 46, 82, 0.42)',
        'cla-login': '0 32px 80px -32px rgba(6, 26, 48, 0.55), 0 0 0 1px rgba(255,255,255,0.06)',
      },
      transitionTimingFunction: {
        'cla-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'cla-rise': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'cla-fade': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'cla-scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'cla-shine': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.9' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'cla-rise': 'cla-rise 0.6s var(--tw-ease, cubic-bezier(0.22, 1, 0.36, 1)) both',
        'cla-fade': 'cla-fade 0.45s ease-out both',
        'cla-scale-in': 'cla-scale-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'cla-shine': 'cla-shine 4s ease-in-out infinite',
        'cla-float-slow': 'float 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
