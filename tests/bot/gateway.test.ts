import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { GuildMember, Interaction, User } from 'discord.js';
import type { CommandReply, CommandRequest } from '../../src/commands/types.js';

const run = jest.fn<(request: CommandRequest) => Promise<CommandReply>>();
const findCommand = jest.fn<(name: string) => unknown>();

jest.unstable_mockModule('../../src/commands/index.js', () => ({ commands: [], findCommand }));

const { handleInteraction, resolveDisplayName, toCommandRequest } = await import(
  '../../src/bot/gateway.js'
);

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

type FakeUser = Pick<User, 'id' | 'username'> & { displayName?: string };

interface FakeInteraction {
  commandName: string;
  isChatInputCommand: () => boolean;
  options: { getUser: jest.Mock<() => FakeUser | null>; getMember: jest.Mock<() => unknown> };
  deferReply: jest.Mock<() => Promise<void>>;
  editReply: jest.Mock<(payload: unknown) => Promise<void>>;
}

const defaultUser: FakeUser = { id: '42', displayName: 'GlobalName', username: 'username' };

function makeInteraction({
  commandName = 'roast',
  isChatInputCommand = true,
  user = defaultUser as FakeUser | null,
  member = { displayName: 'ServerNick' } as unknown,
} = {}): FakeInteraction {
  return {
    commandName,
    isChatInputCommand: () => isChatInputCommand,
    options: {
      getUser: jest.fn<() => FakeUser | null>(() => user),
      getMember: jest.fn<() => unknown>(() => member),
    },
    deferReply: jest.fn<() => Promise<void>>(async () => {}),
    editReply: jest.fn<(payload: unknown) => Promise<void>>(async () => {}),
  };
}

function dispatch(interaction: FakeInteraction): Promise<void> {
  return handleInteraction(interaction as unknown as Interaction);
}

beforeEach(() => {
  run.mockReset();
  run.mockResolvedValue({ content: '<@42> roasted', mentions: ['42'] });
  findCommand.mockReset();
  findCommand.mockReturnValue({ definition: { name: 'roast' }, run });
  consoleError.mockClear();
});

afterAll(() => {
  consoleError.mockRestore();
});

describe('routing', () => {
  it('ignores interactions that are not chat input commands', async () => {
    const interaction = makeInteraction({ isChatInputCommand: false });

    await dispatch(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('ignores commands that are not registered', async () => {
    findCommand.mockReturnValue(undefined);
    const interaction = makeInteraction({ commandName: 'ping' });

    await dispatch(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('defers before running the slow command', async () => {
    const interaction = makeInteraction();
    let deferredFirst = false;
    run.mockImplementation(async () => {
      deferredFirst = interaction.deferReply.mock.calls.length === 1;
      return { content: 'A roast.', mentions: [] };
    });

    await dispatch(interaction);

    expect(deferredFirst).toBe(true);
  });

  it('edits the reply with the command output, mentioning only the target', async () => {
    const interaction = makeInteraction();

    await dispatch(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '<@42> roasted',
      allowedMentions: { users: ['42'] },
    });
  });
});

describe('toCommandRequest', () => {
  it('resolves the user option to an id and display name', () => {
    const request = toCommandRequest(makeInteraction() as unknown as never);

    expect(request.getUser('user')).toEqual({ id: '42', displayName: 'ServerNick' });
  });

  it('returns null when the option is absent', () => {
    const request = toCommandRequest(makeInteraction({ user: null }) as unknown as never);

    expect(request.getUser('user')).toBeNull();
  });
});

describe('resolveDisplayName', () => {
  const user = defaultUser as unknown as User;

  it('uses the nickname of a resolved guild member', () => {
    expect(resolveDisplayName(user, { displayName: 'ServerNick' } as unknown as GuildMember)).toBe(
      'ServerNick',
    );
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

  it('falls back to the username when there is no display name', () => {
    const bare = { id: '42', username: 'username' } as unknown as User;

    expect(resolveDisplayName(bare, null)).toBe('username');
  });
});
