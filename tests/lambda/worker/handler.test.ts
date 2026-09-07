import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CommandReply, CommandRequest } from '../../../src/commands/types.js';
import type { WorkerEvent } from '../../../src/lambda/events.js';

const run = jest.fn<(request: CommandRequest) => Promise<CommandReply>>();
const findCommand = jest.fn<(name: string) => unknown>();
const editOriginalResponse = jest.fn<(input: unknown) => Promise<void>>();

jest.unstable_mockModule('../../../src/commands/index.js', () => ({ commands: [], findCommand }));
jest.unstable_mockModule('../../../src/lambda/worker/discord-api.js', () => ({ editOriginalResponse }));

const { handler } = await import('../../../src/lambda/worker/handler.js');

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

const event: WorkerEvent = {
  applicationId: 'app-1',
  interactionToken: 'tok',
  interaction: {
    type: 2,
    data: {
      name: 'roast',
      options: [{ name: 'user', type: 6, value: '42' }],
      resolved: { users: { '42': { id: '42', username: 'someone' } }, members: { '42': { nick: 'Nick' } } },
    },
  },
};

beforeEach(() => {
  run.mockReset();
  run.mockResolvedValue({ content: '<@42> roasted', mentions: ['42'] });
  findCommand.mockReset();
  findCommand.mockReturnValue({ definition: { name: 'roast' }, run });
  editOriginalResponse.mockReset();
  editOriginalResponse.mockResolvedValue(undefined);
  consoleError.mockClear();
});

afterAll(() => {
  consoleError.mockRestore();
});

describe('worker', () => {
  it('runs the command and edits the deferred reply', async () => {
    await handler(event);

    expect(run).toHaveBeenCalledTimes(1);
    expect(editOriginalResponse).toHaveBeenCalledWith({
      applicationId: 'app-1',
      interactionToken: 'tok',
      content: '<@42> roasted',
      mentions: ['42'],
    });
  });

  it('hands the command a request carrying the resolved display name', async () => {
    await handler(event);

    expect(run.mock.calls[0]?.[0].getUser('user')).toEqual({ id: '42', displayName: 'Nick' });
  });

  it('still answers when the command is not registered', async () => {
    findCommand.mockReturnValue(undefined);

    await handler(event);

    expect(editOriginalResponse).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringMatching(/not wired up/i) }),
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it('still answers when the command throws instead of returning a reply', async () => {
    run.mockRejectedValue(new Error('unexpected'));

    await handler(event);

    expect(editOriginalResponse).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringMatching(/something went wrong/i), mentions: [] }),
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it('never leaves the placeholder unedited', async () => {
    run.mockRejectedValue(new Error('unexpected'));

    await handler(event);

    expect(editOriginalResponse).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed follow-up so the invocation is retried', async () => {
    editOriginalResponse.mockRejectedValue(new Error('Discord rejected the follow-up: HTTP 500'));

    await expect(handler(event)).rejects.toThrow(/rejected the follow-up/);
  });
});
