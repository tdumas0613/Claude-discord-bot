import type { Config } from 'jest';

/**
 * The project is native ESM TypeScript, so ts-jest compiles the tests in-memory
 * and Jest needs `--experimental-vm-modules` (wired into the npm scripts).
 */
const config: Config = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json' }],
  },
  // NodeNext requires the `.js` suffix on relative imports even in TypeScript
  // source; strip it so Jest resolves to the `.ts` file on disk.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/tests/**/*.test.ts'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/deploy-commands.ts'],
};

export default config;
