import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        election: {
          navy: '#0b1020',
          blue: '#1d4ed8',
          cyan: '#22d3ee',
          gold: '#fbbf24',
          green: '#10b981',
          red: '#ef4444',
          purple: '#8b5cf6',
        },
      },
      boxShadow: {
        card: '0 10px 30px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
