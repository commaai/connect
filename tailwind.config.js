/** @type {import('tailwindcss').Config} */
module.exports = {
  important: true,
  future: {
    // only apply hover: styles on devices with a real pointer, so taps on iOS
    // don't leave a sticky :hover highlight on buttons
    hoverOnlyWhenSupported: true,
  },
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
        xxs: '360px'
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
