import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@lamdis-ai/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // NOTE: Global font sizes were increased (see globals.css) by ~1 step on 2025-09-27.
      // We kept Tailwind's default scale but bumped base body (16 -> 17) and heading utilities.
      fontFamily: {
        heading: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        slate: {
          50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1',
          400: '#94A3B8', 500: '#64748B', 600: '#475569', 700: '#334155',
          800: '#1E293B', 900: '#0F172A'
        },
        ink: '#0E1116',
        paper: '#FFFFFF',
        cyan: { DEFAULT: '#06B6D4' },
        violet: { DEFAULT: '#7C3AED' },
        success: '#10B981', warning: '#F59E0B', danger: '#EF4444', info: '#0891B2'
      },
      boxShadow: {
        'elev-1': '0 1px 2px rgba(2,6,23,0.06)',
        'elev-2': '0 4px 12px rgba(2,6,23,0.08)',
        'elev-3': '0 8px 24px rgba(2,6,23,0.12)'
      },
      borderRadius: {
        card: '14px',
        input: '10px'
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg,#06B6D4 0%,#7C3AED 100%)'
      },
      opacity: {
        '2': '0.02', '3': '0.03', '4': '0.04', '5': '0.05', '6': '0.06', '7': '0.07', '8': '0.08', '10': '0.10'
      }
    }
  },
  plugins: [
    plugin(function({ addVariant, addUtilities, theme }) {
      addVariant('hocus', ['&:hover', '&:focus-visible']);
      addUtilities({
        '.pattern-tile': {
          'background-image': 'var(--pattern-url, radial-gradient(circle at 1px 1px, rgba(148,163,184,0.08) 1px, transparent 0))',
          'background-size': '24px 24px'
        },
        '.no-ligs': { 'font-variant-ligatures': 'none' },
        '.tabular': { 'font-variant-numeric': 'tabular-nums' },
        '.hairline': { 'border-width': '1px' }
      });
    })
  ]
};

export default config;
