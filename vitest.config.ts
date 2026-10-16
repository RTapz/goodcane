import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        // Builds the app and needs a seeded database: run with `pnpm test:api`.
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
          hookTimeout: 300000
        }
      }
    ]
  }
})
