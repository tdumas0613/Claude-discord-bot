import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CommandRequest, CommandUser } from '../../../src/commands/types.js';

const generateRoast = jest.fn<(displayName: string) => Promise<string>>();

class RoastRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoastRefusedError';
  }
}

type Reason = 'rate_limited' | 'authentication' | 'api_error' | 'empty_response' | 'unknown';

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

jest.unstable_mockModule('../../../src/commands/roast/generate.js', () => ({
  generateRoast,
  RoastRefusedError,
  RoastUnavailableError,
}));

const { run, errorMessage } = await import('../../../src/commands/roast/handler.js');

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

/** A request as any transport would hand it over. */
function request(user: CommandUser | null = { id: '42', displayName: 'ServerNick' }): CommandRequest {
  return { commandName: 'roast', getUser: () => user };
}

beforeEach(() => {
  generateRoast.mockReset();
  generateRoast.mockResolvedValue('Great name, terrible decision.');
  consoleError.mockClear();
});

afterAll(() => {
  consoleError.mockRestore();
});

describe('run', () => {
  it('passes only the resolved display name to the model', async () => {
    await run(request());

    expect(generateRoast).toHaveBeenCalledTimes(1);
    expect(generateRoast).toHaveBeenCalledWith('ServerNick');
    expect(generateRoast.mock.calls[0]).toHaveLength(1);
  });

  it('returns the roast, mentioning only the target', async () => {
    await expect(run(request())).resolves.toEqual({
      content: '<@42> Great name, terrible decision.',
      mentions: ['42'],
    });
  });

  it('handles a payload with no user option rather than throwing', async () => {
    const reply = await run(request(null));

    expect(reply.content).toMatch(/could not tell who/i);
    expect(reply.mentions).toEqual([]);
    expect(generateRoast).not.toHaveBeenCalled();
  });

  it('returns the spared message on a refusal without logging an error', async () => {
    generateRoast.mockRejectedValue(new RoastRefusedError('Declined.'));

    const reply = await run(request());

    expect(reply.content).toMatch(/consider yourself spared/i);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('logs unexpected failures and still returns a reply', async () => {
    generateRoast.mockRejectedValue(new Error('boom'));

    const reply = await run(request());

    expect(reply.content).toMatch(/something went wrong/i);
    expect(consoleError).toHaveBeenCalled();
  });

  it('never mentions anyone on a failure', async () => {
    generateRoast.mockRejectedValue(new Error('boom'));

    await expect(run(request())).resolves.toMatchObject({ mentions: [] });
  });
});

describe('errorMessage', () => {
  it('describes a refusal', () => {
    expect(errorMessage(new RoastRefusedError('Declined.'))).toContain('spared');
  });

  it('describes a rate limit', () => {
    expect(errorMessage(new RoastUnavailableError('rate_limited', 'slow down', 429))).toMatch(
      /too many roasts/i,
    );
  });

  it('describes an authentication failure', () => {
    expect(errorMessage(new RoastUnavailableError('authentication', 'bad key', 401))).toMatch(
      /api key/i,
    );
  });

  it('includes the status for other API errors', () => {
    expect(errorMessage(new RoastUnavailableError('api_error', 'oops', 503))).toContain('503');
  });

  it('falls back to the generic message for an empty response', () => {
    expect(errorMessage(new RoastUnavailableError('empty_response', 'no text'))).toMatch(
      /something went wrong/i,
    );
  });

  it('has a generic fallback for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toMatch(/something went wrong/i);
  });

  it('never leaks the underlying error message to the channel', () => {
    expect(errorMessage(new Error('sk-ant-secret-key-leaked'))).not.toContain('sk-ant-secret');
  });
});
