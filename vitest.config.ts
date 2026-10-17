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
        // Real database, *_test only: run with `pnpm test:integration`.
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30000
        }
      },
      {
        // Builds the app and seeds the *_test database: run with `pnpm test:api`.
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/api/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 300000
        }
      }
    ]
  }
})
