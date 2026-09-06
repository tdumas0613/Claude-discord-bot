import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Interaction } from 'discord.js';

const execute = jest.fn<(interaction: unknown) => Promise<void>>();

// Stand in for the whole roast command so the router is tested on its own.
jest.unstable_mockModule('../../src/commands/roast/index.js', () => ({
  roast: {
    definition: { name: 'roast', description: 'Generate a roast.', options: [] },
    execute,
  },
}));

const { commands, handleInteraction } = await import('../../src/commands/index.js');

interface FakeInteraction {
  commandName: string;
  isChatInputCommand: () => boolean;
}

function makeInteraction(
  commandName = 'roast',
  isChatInputCommand = true,
): FakeInteraction {
  return { commandName, isChatInputCommand: () => isChatInputCommand };
}

function dispatch(interaction: FakeInteraction): Promise<void> {
  return handleInteraction(interaction as unknown as Interaction);
}

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue(undefined);
});

describe('registered commands', () => {
  it('exposes one definition per command, keyed for registration', () => {
    expect(commands).toHaveLength(1);
    expect(commands[0]?.name).toBe('roast');
  });
});

describe('routing', () => {
  it('dispatches a matching command to its handler', async () => {
    const interaction = makeInteraction();

    await dispatch(interaction);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(interaction);
  });

  it('ignores interactions that are not chat input commands', async () => {
    await dispatch(makeInteraction('roast', false));

    expect(execute).not.toHaveBeenCalled();
  });

  it('ignores commands that are not registered', async () => {
    await dispatch(makeInteraction('ping'));

    expect(execute).not.toHaveBeenCalled();
  });

  it('propagates a handler failure rather than swallowing it', async () => {
    execute.mockRejectedValue(new Error('handler blew up'));

    await expect(dispatch(makeInteraction())).rejects.toThrow('handler blew up');
  });
});
