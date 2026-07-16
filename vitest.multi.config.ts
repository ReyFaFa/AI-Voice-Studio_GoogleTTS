import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/multiSpeaker.test.ts', 'test/voices.test.ts'],
  },
})
