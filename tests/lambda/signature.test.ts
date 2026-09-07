import { describe, expect, it } from '@jest/globals';
import { generateKeyPairSync, sign } from 'node:crypto';
import { isValidRequest } from '../../src/lambda/signature.js';

/**
 * Discord signs `timestamp + rawBody` with its application key and refuses to
 * register an endpoint that accepts a bad signature — it probes with invalid
 * ones deliberately. These tests stand in for that probe.
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyHex = Buffer.from(
  publicKey.export({ format: 'jwk' }).x as string,
  'base64url',
).toString('hex');

const timestamp = '1757000000';
const rawBody = JSON.stringify({ type: 1 });

function signedWith(ts: string, body: string): string {
  return sign(null, Buffer.from(ts + body), privateKey).toString('hex');
}

describe('isValidRequest', () => {
  it('accepts a correctly signed request', () => {
    expect(
      isValidRequest({ publicKeyHex, signature: signedWith(timestamp, rawBody), timestamp, rawBody }),
    ).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    expect(
      isValidRequest({
        publicKeyHex,
        signature: signedWith(timestamp, rawBody),
        timestamp,
        rawBody: JSON.stringify({ type: 2 }),
      }),
    ).toBe(false);
  });

  it('rejects a replayed signature under a different timestamp', () => {
    expect(
      isValidRequest({
        publicKeyHex,
        signature: signedWith(timestamp, rawBody),
        timestamp: '1757009999',
        rawBody,
      }),
    ).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    const other = generateKeyPairSync('ed25519');
    const foreign = sign(null, Buffer.from(timestamp + rawBody), other.privateKey).toString('hex');

    expect(isValidRequest({ publicKeyHex, signature: foreign, timestamp, rawBody })).toBe(false);
  });

  it.each([
    ['a missing signature', undefined, timestamp],
    ['a missing timestamp', signedWith(timestamp, rawBody), undefined],
  ])('rejects %s', (_label, signature, ts) => {
    expect(isValidRequest({ publicKeyHex, signature, timestamp: ts, rawBody })).toBe(false);
  });

  it.each([
    ['garbage that is not hex', 'not-hex-at-all'],
    ['a signature of the wrong length', 'abcd'],
    ['an all-zero signature', '00'.repeat(64)],
  ])('rejects %s', (_label, signature) => {
    expect(isValidRequest({ publicKeyHex, signature, timestamp, rawBody })).toBe(false);
  });

  it('rejects rather than throws when the public key is malformed', () => {
    expect(
      isValidRequest({
        publicKeyHex: 'aabb',
        signature: signedWith(timestamp, rawBody),
        timestamp,
        rawBody,
      }),
    ).toBe(false);
  });
});
