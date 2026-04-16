import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: '#1e1e2e',
          surface: '#2a2a3e',
          border: '#3a3a4e',
          text: '#cdd6f4',
          muted: '#6c7086',
          accent: '#89b4fa',
          danger: '#f38ba8',
          success: '#a6e3a1',
          warning: '#fab387',
        },
      },
    },
  },
  plugins: [],
};

export default config;
