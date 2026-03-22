/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--color-background)',
          surface: 'var(--color-surface)',
          raised: 'var(--color-surface-raised)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          dark: 'var(--color-primary-dark)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
        },
        gold: {
          DEFAULT: 'var(--color-gold)',
        },
        live: {
          DEFAULT: 'var(--color-live)',
        },
        text: {
          DEFAULT: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
      },
      spacing: {
        'xs': '4px',
        'sm-space': '8px',
        'md-space': '12px',
        'lg-space': '16px',
        'xl-space': '24px',
        'xxl': '32px',
      },
      borderRadius: {
        'sm-radius': '6px',
        'md-radius': '10px',
        'lg-radius': '14px',
        'xl-radius': '20px',
      },
      fontSize: {
        'xs-text': '11px',
        'sm-text': '13px',
        'md-text': '15px',
        'lg-text': '17px',
        'xl-text': '20px',
        'xxl-text': '24px',
        'display': '32px',
      },
    },
  },
  plugins: [],
};
