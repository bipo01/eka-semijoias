import { defineConfig } from 'vitest/config';

/*
 * Worker tests (Node environment).
 * - Unit: `npm run test:worker` (worker/test/*.test.ts, no server).
 * - Integration: `npm run test:integration` (worker/test/integration/*, real local
 *   workerd with D1 + Durable Object, started by global-setup.ts).
 */
const integration = process.env.WORKER_SUITE === 'integration';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: integration ? ['worker/test/integration/**/*.test.ts'] : ['worker/test/*.test.ts'],
    ...(integration ? { globalSetup: ['worker/test/global-setup.ts'], testTimeout: 20_000, hookTimeout: 90_000, fileParallelism: false } : {}),
  },
});
