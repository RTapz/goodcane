export default defineAppConfig({
  ui: {
    colors: {
      primary: 'cane',
      neutral: 'stone'
    },
    // Visual style (spec 6.4): pill buttons and badges.
    button: {
      slots: {
        base: 'rounded-full font-semibold'
      }
    },
    badge: {
      slots: {
        base: 'rounded-full'
      }
    }
  }
})
