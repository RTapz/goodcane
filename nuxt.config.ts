// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  // The demo is designed light-only (green and cream), so ignore the device's dark setting.
  ui: {
    colorMode: false
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
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  },

  // Read from the variable names in .env.example. Top-level keys stay on the server;
  // only `public` is sent to the browser.
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    demoWhatsappNumber: process.env.DEMO_WHATSAPP_NUMBER ?? '',
    ownerPasscode: process.env.OWNER_PASSCODE ?? '',
    public: {
      demoMode: process.env.DEMO_MODE !== 'false',
      appUrl: process.env.APP_URL ?? 'http://localhost:3000'
    }
  }
})
