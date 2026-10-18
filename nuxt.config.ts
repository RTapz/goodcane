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

  // Pre-compress built assets (gzip and Brotli) so a weak connection downloads far less.
  nitro: {
    compressPublicAssets: true
  },

  typescript: {
    strict: true,
    // Type-check plain Node unit tests too (paths are relative to .nuxt/).
    nodeTsConfig: {
      include: ['../tests/unit/**/*', '../tests/api/**/*', '../tests/integration/**/*', '../tests/support/**/*']
    }
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en-GB' },
      title: 'GoodCane Drops (Demo)',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#1f5c2f' }
      ],
      // Installable from C6 ("Add to home screen"). Icons are a plain text "GD" tile.
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icons/icon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/icon-180.png' }
      ]
    }
  },

  // Read from the variable names in .env.example. Top-level keys stay on the server;
  // only `public` is sent to the browser.
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
