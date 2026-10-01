import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta institucional azul
        marca: { 50: '#eff6ff', 100: '#dbeafe', 600: '#1d5fbf', 700: '#174a99', 800: '#133d7d', 900: '#0c2a57' },
      },
    },
  },
  plugins: [],
} satisfies Config;
