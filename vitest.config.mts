import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    maxWorkers: 4,
    projects: [
      { extends: 'packages/engine/vitest.config.mts', root: '.' },
      { extends: 'apps/server/vitest.config.mts', root: '.' },
      { extends: 'apps/game-client/vitest.config.mts', root: '.' },
      { extends: 'tests/architecture/vitest.config.mts', root: '.' },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['packages/engine/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/types/**',
        'packages/engine/src/engine/numeric-values.ts',
      ],
      // Ratchet: measured on the current tree, then frozen one point below the
      // measurement so ordinary noise cannot fail the build. Raise these as
      // coverage improves; never lower them. A lower threshold means the gate
      // was weakened, which is the failure mode this block exists to prevent.
      //
      // Measured 2026-10-29: lines 94.43, statements 91.36, functions 94.04,
      // branches 86.45.
      thresholds: {
        lines: 94,
        statements: 91,
        functions: 93,
        branches: 86,
      },
    },
  },
});
