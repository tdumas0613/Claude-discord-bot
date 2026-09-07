/**
 * The CDK app is CommonJS — the default for a CDK project and what ts-node
 * expects from `cdk.json`. That is deliberately not the bot's ESM setup, which
 * is why these tests need no `--experimental-vm-modules`.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};
