import type { Config } from 'tailwindcss';

/**
 * Design tokens — "Neon Street" (SPECIFICATION §15).
 *
 * Every colour below is taken from the brand's own assets: the illuminated
 * storefront sign and the logo. Nothing here was invented except `success`,
 * which had no brand equivalent and is needed for confirmations.
 *
 * Usage discipline (D-197):
 *   orange    primary actions only — Order, Add to cart
 *   yellow    badges and promotions
 *   red       errors and out-of-stock
 *   maroon    gradient partner with black in hero sections
 *   green     confirmations
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0A0A0A', // logo background
          surface: '#151515', // elevated cards
          raised: '#1F1F1F', // inputs, borders
        },
        neon: '#FF6A00', // sign letter edges — primary action
        maroon: '#8B1A1A', // sign backing board
        signal: '#E23B2E', // logo phone icons — errors, sold out
        highlight: '#FFE600', // Arabic line in the logo — badges
        metal: '#C9CDD2', // sign letter faces
        muted: '#A8A8A8',
        success: '#22C55E', // added: no brand equivalent existed
      },

      fontFamily: {
        // Latin display / Arabic display. The <html lang> attribute decides
        // which is used; see tokens.css.
        display: ['Anton', 'Cairo', 'system-ui', 'sans-serif'],
        body: ['Inter', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },

      /**
       * Two type scales, not one.
       *
       * Arabic glyphs read optically smaller than Latin at the same px value and
       * need more line-height (D-101). A single scale would leave Arabic looking
       * cramped and slightly too small on every screen.
       */
      fontSize: {
        'display-lg': ['clamp(2.5rem, 8vw, 5rem)', { lineHeight: '0.95', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(2rem, 5vw, 3.25rem)', { lineHeight: '1', letterSpacing: '-0.01em' }],
        'display-sm': ['clamp(1.5rem, 3.5vw, 2rem)', { lineHeight: '1.1' }],
        'ar-display-lg': ['clamp(2.75rem, 8.5vw, 5.5rem)', { lineHeight: '1.25' }],
        'ar-display-md': ['clamp(2.15rem, 5.5vw, 3.5rem)', { lineHeight: '1.3' }],
        'ar-display-sm': ['clamp(1.65rem, 4vw, 2.15rem)', { lineHeight: '1.4' }],
      },

      borderRadius: {
        card: '0.5rem',
        control: '0.375rem',
      },

      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '250ms',
      },

      boxShadow: {
        // The one signature effect: a restrained echo of the storefront neon.
        // Used on primary actions only.
        neon: '0 0 0 1px rgba(255,106,0,0.4), 0 0 20px -4px rgba(255,106,0,0.55)',
      },

      maxWidth: {
        content: '80rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
