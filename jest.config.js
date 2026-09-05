/**
 * The project is native ESM, so Jest runs without a transform and needs
 * `--experimental-vm-modules` (wired into the npm scripts).
 */
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.js', '!src/index.js', '!src/deploy-commands.js'],
};
