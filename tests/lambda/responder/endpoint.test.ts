import { describe, expect, it } from '@jest/globals';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createHandler } from '../../../src/lambda/responder/handler.js';
import {
  MAX_TIMESTAMP_SKEW_SECONDS,
  isValidRequest,
} from '../../../src/lambda/responder/signature.js';
import type { WorkerEvent } from '../../../src/lambda/events.js';

/**
 * The endpoint contract, end to end.
 *
 * `handler.test.ts` injects a mocked `isValidRequest`, so it proves routing,
 * not verification; `signature.test.ts` proves verification against its own
 * arguments. Neither joins the two through the request shape a Lambda Function
 * URL actually delivers — which is exactly what Discord exercises when it
 * decides whether to accept an Interactions Endpoint URL.
 *
 * Discord refuses to save an endpoint that answers its deliberately-invalid
 * signature probe with anything but a rejection, so these are the assertions
 * that stand between a deploy and a working bot.
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyHex = Buffer.from(
  publicKey.export({ format: 'jwk' }).x as string,
  'base64url',
).toString('hex');

function stamp(secondsAgo = 0): string {
  return String(Math.floor(Date.now() / 1000) - secondsAgo);
}

const dispatched: WorkerEvent[] = [];

function handler() {
  dispatched.length = 0;
  return createHandler({
    publicKeyHex,
    applicationId: 'app-default',
    // The real one. That is the point of this file.
    isValidRequest,
    dispatch: async (event) => {
      dispatched.push(event);
    },
  });
}

/**
 * A Lambda Function URL event, payload format 2.0 — which lowercases every
 * header name. `responder/handler.ts` reads the lowercase forms; a handler
 * looking for `X-Signature-Ed25519` would find nothing and 401 everything.
 */
function functionUrlEvent(
  body: unknown,
  { timestamp = stamp(), base64 = false, signAs = body } = {},
) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const signedBody = typeof signAs === 'string' ? signAs : JSON.stringify(signAs);
  const signature = sign(null, Buffer.from(timestamp + signedBody), privateKey).toString('hex');

  return {
    body: base64 ? Buffer.from(raw).toString('base64') : raw,
    isBase64Encoded: base64,
    headers: {
      'content-type': 'application/json',
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
    },
  };
}

const PING = { type: 1 };
const ROAST = {
  type: 2,
  token: 'interaction-token',
  application_id: 'app-1',
  data: {
    name: 'roast',
    options: [{ name: 'user', type: 6, value: '42' }],
    resolved: { users: { '42': { id: '42', username: 'victim' } }, members: { '42': { nick: null } } },
  },
};

describe("Discord's endpoint verification", () => {
  it('answers a correctly signed PING with a PONG', async () => {
    // Discord will not save the endpoint URL without this exact exchange.
    const response = await handler()(functionUrlEvent(PING));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ type: 1 });
  });

  it('rejects the invalid-signature probe with 401', async () => {
    // Discord sends deliberately bad signatures and refuses any endpoint that
    // accepts them.
    const probe = functionUrlEvent(PING);
    probe.headers['x-signature-ed25519'] = 'ff'.repeat(64);

    expect((await handler()(probe)).statusCode).toBe(401);
  });
});

describe('the Function URL request shape', () => {
  it('reads the lowercased headers payload format 2.0 delivers', async () => {
    const event = functionUrlEvent(PING);

    expect(Object.keys(event.headers)).toEqual(
      expect.arrayContaining(['x-signature-ed25519', 'x-signature-timestamp']),
    );
    expect((await handler()(event)).statusCode).toBe(200);
  });

  it('verifies a base64-encoded body after decoding it', async () => {
    // Lambda may base64 the body depending on content type; the signature
    // covers the decoded bytes either way.
    expect((await handler()(functionUrlEvent(PING, { base64: true }))).statusCode).toBe(200);
  });

  it('verifies against the raw bytes, not a re-serialized copy', async () => {
    // Same JSON, different key order and whitespace. Parsing and
    // re-stringifying before verifying would silently break every request.
    const raw = '{ "type" : 1 }';

    expect((await handler()(functionUrlEvent(raw))).statusCode).toBe(200);
  });

  it('rejects a body altered after signing', async () => {
    const tampered = functionUrlEvent({ type: 2 }, { signAs: PING });

    expect((await handler()(tampered)).statusCode).toBe(401);
  });
});

describe('a signed command over the real signature check', () => {
  it('defers and hands the interaction to the worker', async () => {
    const handle = handler();

    const response = await handle(functionUrlEvent(ROAST));

    expect(JSON.parse(response.body)).toEqual({ type: 5 });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      applicationId: 'app-1',
      interactionToken: 'interaction-token',
    });
  });

  it('refuses a replayed request once it falls outside the window', async () => {
    // Genuinely signed, just old. Without this the capture replays forever,
    // and every replay is a model call charged to us.
    const replayed = functionUrlEvent(ROAST, { timestamp: stamp(MAX_TIMESTAMP_SKEW_SECONDS + 60) });
    const handle = handler();

    expect((await handle(replayed)).statusCode).toBe(401);
    expect(dispatched).toHaveLength(0);
  });
});
