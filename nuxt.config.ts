// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  // The demo is designed light-only (green and cream), so ignore the device's dark setting.
  // Component detection generates theme CSS only for the Nuxt UI components we use (spec 6.3, criterion 5).
  ui: {
    colorMode: false,
    experimental: {
      componentDetection: true
    }
  },

  // A demo: keep it out of search engines, pages and API alike (spec 8).
  routeRules: {
    '/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } }
  },

  // Pre-compress built assets (gzip and Brotli) so a weak connection downloads far less.
  nitro: {
    compressPublicAssets: true
  },

  typescript: {
    strict: true,
    // Type-check plain Node unit tests too (paths are relative to .nuxt/).
    nodeTsConfig: {
      include: ['../tests/unit/**/*', '../tests/api/**/*', '../tests/integration/**/*', '../tests/support/**/*', '../scripts/**/*']
    }
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en-GB' },
      title: 'GoodCane Drops',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'theme-color', content: '#121d16' }
      ],
      // Installable from C6 ("Add to home screen"). Icons are a plain text "GD" tile.
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icons/icon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/icon-180.png' }
      ]
    }
  },

  // Local development reads the plain names in .env (DATABASE_URL and so on). Nuxt only applies
  // NUXT_-prefixed variables at runtime, so a deployment sets NUXT_DATABASE_URL, NUXT_OWNER_PASSCODE,
  // NUXT_TRUST_PROXY, NUXT_DEMO_WHATSAPP_NUMBER, NUXT_PUBLIC_DEMO_MODE and NUXT_PUBLIC_APP_URL
  // (README, Deployment); nothing secret is baked into the build. Top-level keys stay on the
  // server; only `public` is sent to the browser.
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    demoWhatsappNumber: process.env.DEMO_WHATSAPP_NUMBER ?? '',
    ownerPasscode: process.env.OWNER_PASSCODE ?? '',
    // Only true when deployed on Vercel: see server/domain/owner/client-ip.ts.
    trustProxy: process.env.TRUST_PROXY === 'true',
    public: {
      demoMode: process.env.DEMO_MODE !== 'false',
      appUrl: process.env.APP_URL ?? 'http://localhost:3000'
    }
  }
})
