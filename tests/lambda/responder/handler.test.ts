import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { WorkerEvent } from '../../../src/lambda/events.js';

const findCommand = jest.fn<(name: string) => unknown>();

jest.unstable_mockModule('../../../src/commands/index.js', () => ({
  commands: [],
  findCommand,
}));

const { createHandler } = await import('../../../src/lambda/responder/handler.js');

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

const dispatch = jest.fn<(event: WorkerEvent) => Promise<void>>();
const isValidRequest = jest.fn<(input: { rawBody: string; signature?: string; timestamp?: string }) => boolean>();

function handler() {
  return createHandler({
    publicKeyHex: 'aa'.repeat(32),
    applicationId: 'app-default',
    dispatch,
    isValidRequest,
  });
}

function request(body: unknown, { base64 = false } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    body: base64 ? Buffer.from(raw).toString('base64') : raw,
    isBase64Encoded: base64,
    headers: {
      'x-signature-ed25519': 'signature',
      'x-signature-timestamp': '1757000000',
    },
  };
}

const roastCommand = { type: 2, token: 'tok', application_id: 'app-1', data: { name: 'roast' } };

beforeEach(() => {
  dispatch.mockReset();
  dispatch.mockResolvedValue(undefined);
  isValidRequest.mockReset();
  isValidRequest.mockReturnValue(true);
  findCommand.mockReset();
  findCommand.mockReturnValue({ definition: { name: 'roast' }, run: jest.fn() });
  consoleError.mockClear();
});

afterAll(() => {
  consoleError.mockRestore();
});

describe('signature gate', () => {
  it('rejects an invalid signature with 401', async () => {
    isValidRequest.mockReturnValue(false);

    const response = await handler()(request({ type: 1 }));

    expect(response.statusCode).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('verifies the exact bytes received, before parsing', async () => {
    const raw = '{"type":1}';

    await handler()({ body: raw, headers: { 'x-signature-ed25519': 's', 'x-signature-timestamp': 't' } });

    expect(isValidRequest).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: raw, signature: 's', timestamp: 't' }),
    );
  });

  it('decodes a base64 body before verifying it', async () => {
    await handler()(request({ type: 1 }, { base64: true }));

    expect(isValidRequest).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: '{"type":1}' }),
    );
  });
});

describe('PING', () => {
  it('answers a PING with a PONG', async () => {
    const response = await handler()(request({ type: 1 }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ type: 1 });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('application commands', () => {
  it('defers and hands the work to the worker', async () => {
    const response = await handler()(request(roastCommand));

    expect(JSON.parse(response.body)).toEqual({ type: 5 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('dispatches before deferring, so a failed hand-off can still be reported', async () => {
    dispatch.mockRejectedValue(new Error('lambda unreachable'));

    const response = await handler()(request(roastCommand));
    const payload = JSON.parse(response.body);

    expect(payload.type).toBe(4);
    expect(payload.data.content).toMatch(/something went wrong/i);
    expect(consoleError).toHaveBeenCalled();
  });

  it('passes the token and application id the follow-up needs', async () => {
    await handler()(request(roastCommand));

    expect(dispatch).toHaveBeenCalledWith({
      applicationId: 'app-1',
      interactionToken: 'tok',
      interaction: expect.objectContaining({ type: 2 }),
    });
  });

  it('falls back to the configured application id when the payload omits it', async () => {
    await handler()(request({ type: 2, token: 'tok', data: { name: 'roast' } }));

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 'app-default' }));
  });

  it('replies immediately for a command it does not know', async () => {
    findCommand.mockReturnValue(undefined);

    const payload = JSON.parse((await handler()(request(roastCommand))).body);

    expect(payload.type).toBe(4);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a command interaction with no token', async () => {
    const response = await handler()(request({ type: 2, data: { name: 'roast' } }));

    expect(response.statusCode).toBe(400);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('malformed and unsupported input', () => {
  it('rejects a body that is not JSON', async () => {
    expect((await handler()(request('not json'))).statusCode).toBe(400);
  });

  it('rejects an interaction type it does not handle', async () => {
    expect((await handler()(request({ type: 3 }))).statusCode).toBe(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('treats a missing body as unsigned rather than crashing', async () => {
    isValidRequest.mockReturnValue(false);

    expect((await handler()({})).statusCode).toBe(401);
  });

  it('handles a base64 flag with no body at all', async () => {
    await handler()({ isBase64Encoded: true, headers: {} });

    expect(isValidRequest).toHaveBeenCalledWith(expect.objectContaining({ rawBody: '' }));
  });
});
