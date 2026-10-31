// Konfigurasi Tailwind CDN (harus dimuat SETELAH cdn.tailwindcss.com)
//
// TEMA HIJAU — gaya dashboard "UStudy" versi hijau.
// Semua class lama (sky-*, blue-*, indigo-*, cyan-*, violet-*) yang dipakai di
// index.html & file .js dipetakan ke palet hijau di bawah, jadi seluruh halaman
// ikut berubah warna tanpa mengedit class satu per satu.
//   jade  = hijau utama (brand)
//   teal  = hijau kebiruan (pendamping)
//   lime  = hijau muda (aksen kecil)
// amber / rose / emerald tetap dipakai sebagai warna status (peringatan, bahaya, sukses).

const jade = {
  50:  '#effaf4',
  100: '#d6f2e2',
  200: '#aee5c8',
  300: '#78d1a8',
  400: '#3fb888',
  500: '#1fa06e',
  600: '#14875b',
  700: '#106c49',
  800: '#0f553b',
  900: '#0d4531',
  950: '#052a1e',
};
const teal = {
  50:  '#effcf9',
  100: '#d0f7ee',
  200: '#a3ecdd',
  300: '#6bdcc6',
  400: '#36c4ae',
  500: '#16a897',
  600: '#0e867a',
  700: '#106b63',
  800: '#12544f',
  900: '#12443f',
  950: '#052826',
};
const lime = {
  50:  '#f7fce8',
  100: '#eaf7c6',
  200: '#d7ef95',
  300: '#bfe25d',
  400: '#a6d138',
  500: '#88b81f',
  600: '#6a9316',
  700: '#527117',
  800: '#425a18',
  900: '#394d19',
  950: '#1c2a08',
};

tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        jade,
        sky: jade,
        blue: jade,
        indigo: teal,
        cyan: teal,
        violet: lime,
        purple: lime,
        cyber: {
          50: jade[50],
          100: jade[100],
          500: jade[600],
          600: jade[700],
          accent: jade[400],
        },
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(16, 70, 49, 0.06), 0 4px 6px -2px rgba(16, 70, 49, 0.03)',
        'soft-hover': '0 14px 30px -8px rgba(16, 100, 66, 0.16), 0 4px 6px -2px rgba(16, 70, 49, 0.05)',
        'card': '0 1px 2px rgba(16, 70, 49, 0.04), 0 12px 28px -14px rgba(16, 70, 49, 0.10)',
        'card-hover': '0 16px 34px -10px rgba(20, 135, 91, 0.20), 0 4px 6px -2px rgba(16, 70, 49, 0.05)',
        'glow-sky': '0 0 22px -3px rgba(31, 160, 110, 0.35)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
};
