import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';

const generateRoast = jest.fn();

class RoastRefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoastRefusedError';
  }
}

jest.unstable_mockModule('../src/roast.js', () => ({ generateRoast, RoastRefusedError }));

const { handleInteraction, errorMessage } = await import('../src/interaction.js');

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

/** Builds a fake `/roast` interaction with recording reply methods. */
function makeInteraction({
  commandName = 'roast',
  isChatInputCommand = true,
  user = { id: '42', displayName: 'GlobalName', username: 'username', toString: () => '<@42>' },
  member = { displayName: 'ServerNick' },
} = {}) {
  return {
    commandName,
    isChatInputCommand: () => isChatInputCommand,
    options: {
      getUser: jest.fn(() => user),
      getMember: jest.fn(() => member),
    },
    deferReply: jest.fn(async () => {}),
    editReply: jest.fn(async () => {}),
  };
}

beforeEach(() => {
  generateRoast.mockReset();
  generateRoast.mockResolvedValue('Great name, terrible decision.');
  consoleError.mockClear();
});

afterAll(() => {
  consoleError.mockRestore();
});

describe('interaction routing', () => {
  it('ignores interactions that are not chat input commands', async () => {
    const interaction = makeInteraction({ isChatInputCommand: false });

    await handleInteraction(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(generateRoast).not.toHaveBeenCalled();
  });

  it('ignores other slash commands', async () => {
    const interaction = makeInteraction({ commandName: 'ping' });

    await handleInteraction(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(generateRoast).not.toHaveBeenCalled();
  });

  it('defers the reply before the slow API call', async () => {
    const interaction = makeInteraction();
    let deferredFirst = false;
    generateRoast.mockImplementation(async () => {
      deferredFirst = interaction.deferReply.mock.calls.length === 1;
      return 'A roast.';
    });

    await handleInteraction(interaction);

    expect(deferredFirst).toBe(true);
  });
});

describe('display name selection', () => {
  it('prefers the per-server nickname', async () => {
    await handleInteraction(makeInteraction());

    expect(generateRoast).toHaveBeenCalledWith('ServerNick');
  });

  it('falls back to the global display name when the member is unavailable', async () => {
    await handleInteraction(makeInteraction({ member: null }));

    expect(generateRoast).toHaveBeenCalledWith('GlobalName');
  });

  it('falls back to the username when there is no display name', async () => {
    await handleInteraction(
      makeInteraction({
        member: null,
        user: { id: '42', username: 'username', toString: () => '<@42>' },
      }),
    );

    expect(generateRoast).toHaveBeenCalledWith('username');
  });

  it('passes no other information about the user to the model', async () => {
    await handleInteraction(makeInteraction());

    expect(generateRoast).toHaveBeenCalledTimes(1);
    expect(generateRoast.mock.calls[0]).toHaveLength(1);
  });
});

describe('successful roast', () => {
  it('replies with the roast, mentioning only the target', async () => {
    const interaction = makeInteraction();

    await handleInteraction(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '<@42> Great name, terrible decision.',
      allowedMentions: { users: ['42'] },
    });
  });
});

describe('failure handling', () => {
  it('posts the spared message on a refusal without logging an error', async () => {
    const interaction = makeInteraction();
    generateRoast.mockRejectedValue(new RoastRefusedError('Declined.'));

    await handleInteraction(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringMatching(/consider yourself spared/i),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('logs unexpected failures and still replies', async () => {
    const interaction = makeInteraction();
    generateRoast.mockRejectedValue(new Error('boom'));

    await handleInteraction(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.any(String));
    expect(consoleError).toHaveBeenCalled();
  });

  it('never leaves an interaction without a reply', async () => {
    const interaction = makeInteraction();
    generateRoast.mockRejectedValue(new Error('boom'));

    await handleInteraction(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });
});

describe('errorMessage', () => {
  it('describes a refusal', () => {
    expect(errorMessage(new RoastRefusedError('Declined.'))).toContain('spared');
  });

  it('describes a rate limit', () => {
    const error = new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers());

    expect(errorMessage(error)).toMatch(/too many roasts/i);
  });

  it('describes an authentication failure', () => {
    const error = new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers());

    expect(errorMessage(error)).toMatch(/api key/i);
  });

  it('includes the status for other API errors', () => {
    const error = new Anthropic.InternalServerError(503, undefined, 'oops', new Headers());

    expect(errorMessage(error)).toContain('503');
  });

  it('has a generic fallback for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toMatch(/something went wrong/i);
  });

  it('never leaks the underlying error message to the channel', () => {
    const error = new Error('sk-ant-secret-key-leaked');

    expect(errorMessage(error)).not.toContain('sk-ant-secret');
  });
});
