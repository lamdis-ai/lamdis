/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        lamdisBar: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        lamdisBar: 'lamdisBar 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
