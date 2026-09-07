import { describe, expect, it } from '@jest/globals';
import { commands } from '../../src/commands/index.js';
import { COMMAND_NAMES, isCommandName } from '../../src/commands/names.js';

/**
 * `commands/names.ts` exists so the responder Lambda can recognize a command
 * without importing the commands themselves. That means the list is a copy,
 * and a copy can drift — this is the test that stops it.
 */
describe('COMMAND_NAMES', () => {
  it('lists exactly the commands in the registry', () => {
    // Failing here means a command was added or renamed in
    // `commands/index.ts` without updating `commands/names.ts`.
    expect([...COMMAND_NAMES].sort()).toEqual(
      commands.map((definition) => definition.name).sort(),
    );
  });
});

describe('isCommandName', () => {
  it('accepts a registered command', () => {
    expect(isCommandName('roast')).toBe(true);
  });

  it.each(['', 'roasted', 'ROAST', 'toString', 'constructor'])(
    'rejects %p',
    (name) => {
      expect(isCommandName(name)).toBe(false);
    },
  );
});
