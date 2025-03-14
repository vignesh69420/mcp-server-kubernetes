import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Set timeout to 90 seconds for all tests
    testTimeout: 90000
  },
})
