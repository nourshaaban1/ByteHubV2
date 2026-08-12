/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Near-black rather than pure black: #000 against white vibrates and
         * makes long product names harder to scan.
         */
        ink: {
          DEFAULT: '#0a0b0f',
          soft: '#16181f',
          line: '#252833',
          muted: '#5c6474',
          faint: '#949bab',
        },
        /**
         * Electric blue. The catalog is chargers and power banks, so the brand
         * colour leans "current" — and a saturated blue survives being printed
         * on a product photo's white background, which a pastel would not.
         */
        accent: {
          DEFAULT: '#2f5bff',
          hover: '#1f42d6',
          soft: '#eef2ff',
          ring: '#c7d3ff',
        },
        /** Reserved for price drops and "approx." flags — never decoration. */
        flag: '#f59e0b',
        line: '#e8eaf0',
        canvas: '#f6f7f9',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      boxShadow: {
        card: '0 1px 2px rgba(10, 11, 15, 0.04)',
        lift: '0 12px 32px -8px rgba(10, 11, 15, 0.18)',
        glow: '0 0 0 1px rgba(47, 91, 255, 0.12), 0 8px 28px -6px rgba(47, 91, 255, 0.35)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        marquee: 'marquee 32s linear infinite',
      },
    },
  },
  plugins: [],
};
