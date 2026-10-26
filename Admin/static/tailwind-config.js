// Konfigurasi Tailwind CDN (harus dimuat SETELAH cdn.tailwindcss.com)
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        cyber: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0284c7',
          600: '#0369a1',
          accent: '#06b6d4',
        }
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
        'soft-hover': '0 10px 25px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.05), 0 20px 25px -5px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 12px 30px -4px rgba(14, 165, 233, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
        'glow-sky': '0 0 20px -3px rgba(14, 165, 233, 0.25)',
      }
    }
  }
};
