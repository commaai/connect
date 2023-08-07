/** @type {import('tailwindcss').Config} */
module.exports = {
  important: true,
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      animation: {
        fadein: 'fadein 0.25s',
      },
      keyframes: {
        fadein: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
      screens: {
        xs: '480px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
