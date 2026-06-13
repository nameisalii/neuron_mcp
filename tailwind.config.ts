import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
      },
      colors: {
        // Warm semantic palette (Neuron design system)
        cream: '#F7F4EF',
        navy: {
          DEFAULT: '#1A2540',
          deep: '#0E1626',
        },
        accent: {
          DEFAULT: '#3D5AFE',
          soft: '#ECEFFC',
        },
        ink: '#14151A',
        muted: '#5A5E6B',
        warm: '#E7E2D9',
        positive: '#2E7D5B',
        amber: '#B5733A',

        // Brand scale remapped to navy/accent so existing brand-* classes adopt the new look.
        // Active nav uses bg-brand-50 + text-brand-700 → soft blue tint + navy. Primary buttons
        // use brand-600/700 → navy fill + deep-navy hover.
        brand: {
          50: '#ECEFFC',
          100: '#DCE2FA',
          200: '#C2CCF6',
          500: '#3D5AFE',
          600: '#1A2540',
          700: '#0E1626',
          800: '#1A2540',
          900: '#0E1626',
        },

        // Gray scale re-tinted warm so the whole app reads cream/ivory instead of cold gray.
        gray: {
          50: '#F7F4EF',
          100: '#F0ECE4',
          200: '#E7E2D9',
          300: '#D9D3C7',
          400: '#9A9486',
          500: '#5A5E6B',
          600: '#5A5E6B',
          700: '#3A3E49',
          800: '#22252E',
          900: '#14151A',
        },
      },
      borderRadius: {
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        // Soft warm shadows (navy-tinted, never harsh black)
        sm: '0 1px 2px rgba(26,37,64,0.05)',
        DEFAULT: '0 1px 3px rgba(26,37,64,0.08), 0 1px 2px rgba(26,37,64,0.04)',
        md: '0 4px 12px rgba(26,37,64,0.07)',
        lg: '0 8px 24px rgba(26,37,64,0.08)',
        xl: '0 16px 40px rgba(26,37,64,0.10)',
        soft: '0 2px 8px rgba(26,37,64,0.06)',
        lift: '0 6px 20px rgba(26,37,64,0.12)',
      },
    },
  },
  plugins: [],
}

export default config
