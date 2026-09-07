import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { editOriginalResponse } from '../../../src/lambda/worker/discord-api.js';

/**
 * The follow-up is the only Discord REST call the worker makes. It is the same
 * route discord.js reaches through `interaction.editReply`, addressed by the
 * interaction token rather than the bot token.
 */

const fetchMock = jest.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const followUp = {
  applicationId: 'app-1',
  interactionToken: 'tok-abc',
  content: '<@42> roasted',
  mentions: ['42'],
};

function lastCall() {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) {
    throw new Error('expected fetch to have been called');
  }
  return { url: String(call[0]), init: call[1] as RequestInit };
}

describe('editOriginalResponse', () => {
  it('PATCHes the original interaction response', async () => {
    await editOriginalResponse(followUp);

    const { url, init } = lastCall();
    expect(url).toBe(
      'https://discord.com/api/v10/webhooks/app-1/tok-abc/messages/@original',
    );
    expect(init.method).toBe('PATCH');
  });

  it('sends the content and restricts pings to the target', async () => {
    await editOriginalResponse(followUp);

    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      content: '<@42> roasted',
      allowed_mentions: { parse: [], users: ['42'] },
    });
  });

  it('suppresses every mention when the reply names nobody', async () => {
    await editOriginalResponse({ ...followUp, mentions: [] });

    expect(JSON.parse(String(lastCall().init.body)).allowed_mentions).toEqual({
      parse: [],
      users: [],
    });
  });

  it('does not send a bot token — the interaction token authorizes it', async () => {
    await editOriginalResponse(followUp);

    const headers = lastCall().init.headers as Record<string, string>;
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain('authorization');
  });

  it('throws with the status when Discord rejects the edit', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"Unknown Webhook"}', { status: 404 }));

    await expect(editOriginalResponse(followUp)).rejects.toThrow(/404/);
  });

  it('includes the response body in the error, for diagnosis', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"Invalid Webhook Token"}', { status: 401 }));

    await expect(editOriginalResponse(followUp)).rejects.toThrow(/Invalid Webhook Token/);
  });

  it('still reports a rejection when the body is empty', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    await expect(editOriginalResponse(followUp)).rejects.toThrow(/empty body/);
  });

  it('still reports a rejection when the body cannot be read', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.reject(new Error('stream closed')),
    } as unknown as Response);

    await expect(editOriginalResponse(followUp)).rejects.toThrow(/502/);
  });
});
