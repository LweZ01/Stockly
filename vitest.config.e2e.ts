// vitest.config.e2e.ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['src/**/*.e2e-spec.ts'],
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
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

