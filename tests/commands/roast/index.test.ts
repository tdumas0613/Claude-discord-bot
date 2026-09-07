import { describe, expect, it, jest } from '@jest/globals';

// Importing the façade pulls in the handler and the generator, which construct
// an Anthropic client and read config at module load. Stub both so this test
// stays about the wiring.
jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    beta = { messages: { create: jest.fn() } };
  },
}));

jest.unstable_mockModule('../../../src/config.js', () => ({
  requireEnv: (name: string) => `test-${name}`,
  optionalEnv: () => null,
  failFast: (read: () => unknown) => read(),
  MissingConfigError: class extends Error {},
}));

const { roast } = await import('../../../src/commands/roast/index.js');
const { roastCommand } = await import('../../../src/commands/roast/command.js');
const { run } = await import('../../../src/commands/roast/handler.js');

/**
 * The façade the registry consumes. Nothing else should need to know how the
 * roast folder is put together internally.
 */
describe('roast command export', () => {
  it('carries the definition the registry sends to Discord', () => {
    expect(roast.definition).toEqual(roastCommand.toJSON());
    expect(roast.definition.name).toBe('roast');
  });

  it('wires the handler as its runner', () => {
    expect(roast.run).toBe(run);
  });
});
