import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta institucional azul
        marca: { 50: '#eff6ff', 100: '#dbeafe', 600: '#1d5fbf', 700: '#174a99', 800: '#133d7d', 900: '#0c2a57' },
        // Rojo institucional tomado del logo de Dusakawi EPSI (#FF0A0A); 600 = tono para texto sobre blanco (contraste AA)
        red: { 50: '#fff1f1', 100: '#ffdfdf', 200: '#ffc5c5', 300: '#ff9d9d', 400: '#ff5a5a', 500: '#ff0a0a', 600: '#e30613', 700: '#bf0510', 800: '#9c0a12', 900: '#7f0e14', 950: '#460204' },
      },
    },
  },
  plugins: [],
} satisfies Config;
