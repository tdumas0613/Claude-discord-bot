import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * The worker's key lives in Secrets Manager, but `commands/roast/generate.ts`
 * reads `process.env.ANTHROPIC_API_KEY` and must keep doing so — the command
 * layer does not know about AWS. This module is the bridge.
 */

const send = jest.fn<(command: unknown) => Promise<{ SecretString?: string }>>();

jest.unstable_mockModule('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = send;
  },
  GetSecretValueCommand: class {
    readonly input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

const KEY = 'sk-ant-from-secrets-manager';

/**
 * The fetched value is cached in module scope so a warm container reuses it,
 * which means a test that wants a cold container needs a fresh module. Tests
 * about caching call the returned function twice instead.
 */
async function coldStart(): Promise<() => Promise<void>> {
  jest.resetModules();
  const { loadAnthropicKey } = await import('../../../src/lambda/worker/secrets.js');
  return loadAnthropicKey;
}

function sentSecretId(): unknown {
  const call = send.mock.calls.at(-1)?.[0] as { input?: { SecretId?: string } } | undefined;
  return call?.input?.SecretId;
}

beforeEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['ANTHROPIC_SECRET_ID'];
  send.mockReset();
  send.mockResolvedValue({ SecretString: KEY });
});

afterAll(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['ANTHROPIC_SECRET_ID'];
});

describe('loadAnthropicKey', () => {
  it('puts the secret where the command layer already looks', async () => {
    process.env['ANTHROPIC_SECRET_ID'] = 'bot/anthropic';

    await (await coldStart())();

    expect(process.env['ANTHROPIC_API_KEY']).toBe(KEY);
    expect(sentSecretId()).toBe('bot/anthropic');
  });

  it('unwraps a JSON secret by key', async () => {
    process.env['ANTHROPIC_SECRET_ID'] = 'bot/anthropic';
    send.mockResolvedValue({ SecretString: JSON.stringify({ ANTHROPIC_API_KEY: KEY }) });

    await (await coldStart())();

    expect(process.env['ANTHROPIC_API_KEY']).toBe(KEY);
  });

  it('does not call AWS when the key is already in the environment', async () => {
    // This is the local path: `.env` sets the key and there is no secret.
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-local';
    process.env['ANTHROPIC_SECRET_ID'] = 'bot/anthropic';

    await (await coldStart())();

    expect(send).not.toHaveBeenCalled();
    expect(process.env['ANTHROPIC_API_KEY']).toBe('sk-ant-local');
  });

  it('leaves the missing-variable error to the command layer when neither is set', async () => {
    await expect((await coldStart())()).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
    expect(process.env['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('fetches once and reuses the value across warm invocations', async () => {
    process.env['ANTHROPIC_SECRET_ID'] = 'bot/anthropic';
    const loadAnthropicKey = await coldStart();

    await loadAnthropicKey();
    delete process.env['ANTHROPIC_API_KEY'];
    await loadAnthropicKey();

    // Secrets Manager bills per call and the value only changes on rotation.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an empty secret', {}],
    ['JSON without the key', { SecretString: JSON.stringify({ OTHER: 'x' }) }],
    ['JSON with a non-string key', { SecretString: JSON.stringify({ ANTHROPIC_API_KEY: 42 }) }],
  ])('throws on %s', async (_label, response) => {
    process.env['ANTHROPIC_SECRET_ID'] = 'bot/anthropic';
    send.mockResolvedValue(response as { SecretString?: string });

    await expect((await coldStart())()).rejects.toThrow(/bot\/anthropic/);
  });

  it('retries on the next invocation after a failure', async () => {
    process.env['ANTHROPIC_SECRET_ID'] = 'bot/anthropic';
    send.mockRejectedValueOnce(new Error('AccessDeniedException'));
    const loadAnthropicKey = await coldStart();

    // A failed fetch must not poison every later call on a warm container.
    await expect(loadAnthropicKey()).rejects.toThrow('AccessDeniedException');

    send.mockResolvedValue({ SecretString: KEY });
    await loadAnthropicKey();

    expect(process.env['ANTHROPIC_API_KEY']).toBe(KEY);
  });
});
