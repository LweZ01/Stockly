import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['src/**/*.rate-limit.e2e-spec.ts'],
    environment: 'node',
    setupFiles: ['./test/setup-env.rate-limit.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
