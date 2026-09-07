import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../src/commands/roast/index.js', () => ({
  roast: {
    definition: { name: 'roast', description: 'Generate a roast.', options: [] },
    run: jest.fn(),
  },
}));

const { commands, findCommand } = await import('../../src/commands/index.js');

describe('command registry', () => {
  it('exposes one definition per command, for registration', () => {
    expect(commands).toHaveLength(1);
    expect(commands[0]?.name).toBe('roast');
  });

  it('finds a registered command by name', () => {
    expect(findCommand('roast')).toBeDefined();
  });

  it('returns undefined for a command it does not handle', () => {
    expect(findCommand('definitely-not-a-command')).toBeUndefined();
  });
});
