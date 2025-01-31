import type { Config } from 'tailwindcss'
import * as defaultTheme from 'tailwindcss/defaultTheme'

export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    borderRadius: {
      none: '0',
      xs: '0.25em',
      sm: '0.5em',
      md: '0.75em',
      lg: '1em',
      xl: '1.75em',
      full: '9999px',
    },
    fontWeight: {
      light: '300',
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
    extend: {
      colors: Object.fromEntries(
        [
          'primary',
          'surface-tint',
          'on-primary',
          'primary-container',
          'on-primary-container',
          'secondary',
          'on-secondary',
          'secondary-container',
          'on-secondary-container',
          'tertiary',
          'on-tertiary',
          'tertiary-container',
          'on-tertiary-container',
          'error',
          'on-error',
          'error-container',
          'on-error-container',
          'background',
          'on-background',
          'surface',
          'on-surface',
          'surface-variant',
          'on-surface-variant',
          'outline',
          'outline-variant',
          'shadow',
          'scrim',
          'inverse-surface',
          'inverse-on-surface',
          'inverse-primary',
          'primary-fixed',
          'on-primary-fixed',
          'primary-fixed-dim',
          'on-primary-fixed-variant',
          'secondary-fixed',
          'on-secondary-fixed',
          'secondary-fixed-dim',
          'on-secondary-fixed-variant',
          'tertiary-fixed',
          'on-tertiary-fixed',
          'tertiary-fixed-dim',
          'on-tertiary-fixed-variant',
          'surface-dim',
          'surface-bright',
          'surface-container-lowest',
          'surface-container-low',
          'surface-container',
          'surface-container-high',
          'surface-container-highest',
        ].map((name) => [name, `var(--color-${name})`]),
      ),
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
      },
      fontSize: {
        'display-lg': ['57px', {
          lineHeight: '64px',
          letterSpacing: '-0.25px',
        }],
        'display-md': ['45px', {
          lineHeight: '52px',
        }],
        'display-sm': ['36px', {
          lineHeight: '44px',
        }],
        'headline-lg': ['32px', {
          lineHeight: '40px',
        }],
        'headline-md': ['28px', {
          lineHeight: '36px',
        }],
        'headline-sm': ['24px', {
          lineHeight: '32px',
        }],
        'title-lg': ['22px', {
          lineHeight: '28px',
        }],
        'title-md': ['16px', {
          lineHeight: '24px',
          fontWeight: 500,
          letterSpacing: '0.15px',
        }],
        'title-sm': ['14px', {
          lineHeight: '20px',
          fontWeight: 500,
          letterSpacing: '0.1px',
        }],
        'label-lg': ['14px', {
          lineHeight: '20px',
          fontWeight: 500,
        }],
        'label-md': ['12px', {
          lineHeight: '18px',
          fontWeight: 500,
        }],
        'label-sm': ['11px', {
          lineHeight: '16px',
          fontWeight: 500,
          letterSpacing: '0.5px',
        }],
        'body-lg': ['16px', {
          lineHeight: '24px',
          letterSpacing: '0.5px',
        }],
        'body-md': ['14px', {
          lineHeight: '20px',
          letterSpacing: '0.25px',
        }],
        'body-sm': ['12px', {
          lineHeight: '16px',
          letterSpacing: '0.4px',
        }],
      },
      keyframes: {
        shimmer: {
          '100%': {
            transform: 'translateX(100%)',
          },
        },
        indeterminate1: {
          '0%': {
            left: '-35%',
            right: '100%',
          },
          '60%': {
            left: '100%',
            right: '-90%',
          },
          '100%': {
            left: '100%',
            right: '-90%',
          },
        },
        indeterminate2: {
          '0%': {
            left: '-200%',
            right: '100%',
          },
          '60%': {
            left: '107%',
            right: '-8%',
          },
          '100%': {
            left: '107%',
            right: '-8%',
          },
        },
        'circular-rotate': {
          '0%': {
            transform: 'rotate(0deg)',
          },
          '100%': {
            transform: 'rotate(360deg)',
          },
        },
        'circular-dash': {
          '0%': {
            strokeDasharray: '1px, 200px',
            strokeDashoffset: '0',
          },
          '50%': {
            strokeDasharray: '100px, 200px',
            strokeDashoffset: '-15',
          },
          '100%': {
            strokeDasharray: '100px, 200px',
            strokeDashoffset: '-125',
          },
        },
      },
      screens: {
        // Larger screen phones (iPhone Pro/Max, Galaxy Ultra, Pixel XL/Pro...)
        xs: '411px',
      },
      animation: {
        indeterminate1: 'indeterminate1 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite',
        indeterminate2: 'indeterminate2 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) 1.15s infinite',
        'circular-rotate': 'circular-rotate 1.4s linear infinite',
        'circular-dash': 'circular-dash 1.4s ease-in-out infinite',
        'spin': 'spin 1s linear infinite',
      },
      transitionProperty: {
        indeterminate: 'transform, background-color',
        drawer: 'left, opacity, width',
      },
    },
  },
} satisfies Config
