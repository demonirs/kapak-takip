/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kavis: {
          canvas: 'var(--kavis-canvas)', surface: 'var(--kavis-surface)',
          navy: 'var(--kavis-navy)', turquoise: 'var(--kavis-turquoise)',
          soft: 'var(--kavis-soft)', text: 'var(--kavis-text)',
          muted: 'var(--kavis-muted)', border: 'var(--kavis-border)',
          success: 'var(--kavis-success)', warning: 'var(--kavis-warning)',
          danger: 'var(--kavis-danger)', coral: 'var(--kavis-coral)',
        },
      },
    },
  },
  plugins: [],
};
