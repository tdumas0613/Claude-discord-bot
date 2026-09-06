import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { GuildMember, Interaction, User } from 'discord.js';

const generateRoast = jest.fn<(displayName: string) => Promise<string>>();

class RoastRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoastRefusedError';
  }
}

type Reason =
  | 'rate_limited'
  | 'authentication'
  | 'api_error'
  | 'empty_response'
  | 'unknown';

class RoastUnavailableError extends Error {
  readonly reason: Reason;
  readonly status: number | undefined;

  constructor(reason: Reason, message: string, status?: number) {
    super(message);
    this.name = 'RoastUnavailableError';
    this.reason = reason;
    this.status = status;
  }
}

jest.unstable_mockModule('../src/roast.js', () => ({
  generateRoast,
  RoastRefusedError,
  RoastUnavailableError,
}));

const { handleInteraction, errorMessage, resolveDisplayName } = await import(
  '../src/interaction.js'
);

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

/** A stand-in for the pieces of `User` this code path touches. */
type FakeUser = Pick<User, 'id' | 'username'> & {
  displayName?: string;
  toString(): string;
};

interface FakeInteraction {
  commandName: string;
  isChatInputCommand: () => boolean;
  options: {
    getUser: jest.Mock<() => FakeUser>;
    getMember: jest.Mock<() => unknown>;
  };
  deferReply: jest.Mock<() => Promise<void>>;
  editReply: jest.Mock<(payload: unknown) => Promise<void>>;
}

const defaultUser: FakeUser = {
  id: '42',
  displayName: 'GlobalName',
  username: 'username',
  toString: () => '<@42>',
};

/** Builds a fake `/roast` interaction with recording reply methods. */
function makeInteraction({
  commandName = 'roast',
  isChatInputCommand = true,
  user = defaultUser,
  member = { displayName: 'ServerNick' } as unknown,
}: Partial<{
  commandName: string;
  isChatInputCommand: boolean;
  user: FakeUser;
  member: unknown;
}> = {}): FakeInteraction {
  return {
    commandName,
    isChatInputCommand: () => isChatInputCommand,
    options: {
      getUser: jest.fn<() => FakeUser>(() => user),
      getMember: jest.fn<() => unknown>(() => member),
    },
    deferReply: jest.fn<() => Promise<void>>(async () => {}),
    editReply: jest.fn<(payload: unknown) => Promise<void>>(async () => {}),
  };
}

/** The handler takes a real `Interaction`; the fake stands in for one. */
function dispatch(interaction: FakeInteraction): Promise<void> {
  return handleInteraction(interaction as unknown as Interaction);
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

    await dispatch(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(generateRoast).not.toHaveBeenCalled();
  });

  it('ignores other slash commands', async () => {
    const interaction = makeInteraction({ commandName: 'ping' });

    await dispatch(interaction);

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

    await dispatch(interaction);

    expect(deferredFirst).toBe(true);
  });
});

describe('display name selection', () => {
  it('prefers the per-server nickname', async () => {
    await dispatch(makeInteraction());

    expect(generateRoast).toHaveBeenCalledWith('ServerNick');
  });

  it('falls back to the global display name when the member is unavailable', async () => {
    await dispatch(makeInteraction({ member: null }));

    expect(generateRoast).toHaveBeenCalledWith('GlobalName');
  });

  it('falls back to the username when there is no display name', async () => {
    await dispatch(
      makeInteraction({
        member: null,
        user: { id: '42', username: 'username', toString: () => '<@42>' },
      }),
    );

    expect(generateRoast).toHaveBeenCalledWith('username');
  });

  it('passes no other information about the user to the model', async () => {
    await dispatch(makeInteraction());

    expect(generateRoast).toHaveBeenCalledTimes(1);
    expect(generateRoast.mock.calls[0]).toHaveLength(1);
  });
});

describe('resolveDisplayName', () => {
  const user = defaultUser as unknown as User;

  it('uses the nickname of a resolved guild member', () => {
    const member = { displayName: 'ServerNick' } as unknown as GuildMember;

    expect(resolveDisplayName(user, member)).toBe('ServerNick');
  });

  it('reads `nick` from a member resolved off the raw API payload', () => {
    expect(resolveDisplayName(user, { nick: 'RawNick' } as never)).toBe('RawNick');
  });

  it('falls through when the raw API member has a null nickname', () => {
    expect(resolveDisplayName(user, { nick: null } as never)).toBe('GlobalName');
  });

  it('falls back to the global display name without a member', () => {
    expect(resolveDisplayName(user, null)).toBe('GlobalName');
  });
});

describe('successful roast', () => {
  it('replies with the roast, mentioning only the target', async () => {
    const interaction = makeInteraction();

    await dispatch(interaction);

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

    await dispatch(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringMatching(/consider yourself spared/i),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('logs unexpected failures and still replies', async () => {
    const interaction = makeInteraction();
    generateRoast.mockRejectedValue(new Error('boom'));

    await dispatch(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.any(String));
    expect(consoleError).toHaveBeenCalled();
  });

  it('never leaves an interaction without a reply', async () => {
    const interaction = makeInteraction();
    generateRoast.mockRejectedValue(new Error('boom'));

    await dispatch(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });
});

describe('errorMessage', () => {
  it('describes a refusal', () => {
    expect(errorMessage(new RoastRefusedError('Declined.'))).toContain('spared');
  });

  it('describes a rate limit', () => {
    const error = new RoastUnavailableError('rate_limited', 'slow down', 429);

    expect(errorMessage(error)).toMatch(/too many roasts/i);
  });

  it('describes an authentication failure', () => {
    const error = new RoastUnavailableError('authentication', 'bad key', 401);

    expect(errorMessage(error)).toMatch(/api key/i);
  });

  it('includes the status for other API errors', () => {
    const error = new RoastUnavailableError('api_error', 'oops', 503);

    expect(errorMessage(error)).toContain('503');
  });

  it('falls back to the generic message for an empty response', () => {
    const error = new RoastUnavailableError('empty_response', 'no text');

    expect(errorMessage(error)).toMatch(/something went wrong/i);
  });

  it('has a generic fallback for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toMatch(/something went wrong/i);
  });

  it('never leaks the underlying error message to the channel', () => {
    const error = new Error('sk-ant-secret-key-leaked');

    expect(errorMessage(error)).not.toContain('sk-ant-secret');
  });
});
