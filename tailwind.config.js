
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './**/*.html',
    './**/*.js',
    './**/*.php',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef8ff',
          100: '#d9f0ff',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
        },
      },
    },
  },
  plugins: [],
};
