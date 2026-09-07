import { describe, expect, it } from '@jest/globals';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  MAX_TIMESTAMP_SKEW_SECONDS,
  isValidRequest,
} from '../../../src/lambda/responder/signature.js';

/**
 * Discord signs `timestamp + rawBody` with its application key and refuses to
 * register an endpoint that accepts a bad signature — it probes with invalid
 * ones deliberately. These tests stand in for that probe.
 *
 * Timestamps are built relative to now rather than hardcoded: verification
 * rejects anything outside a freshness window, so a fixed date would age out
 * and start failing on its own.
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyHex = Buffer.from(
  publicKey.export({ format: 'jwk' }).x as string,
  'base64url',
).toString('hex');

/** Unix seconds, as Discord sends them, offset by `secondsAgo`. */
function stamp(secondsAgo = 0): string {
  return String(Math.floor(Date.now() / 1000) - secondsAgo);
}

const timestamp = stamp();
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

  it('rejects a signature reused under a different timestamp', () => {
    // Both timestamps are fresh, so this is the signature binding being
    // tested, not the freshness window below.
    expect(
      isValidRequest({
        publicKeyHex,
        signature: signedWith(timestamp, rawBody),
        timestamp: stamp(60),
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

/**
 * A signature proves a request came from Discord, not that it came from
 * Discord just now. Without this window a captured request replays forever,
 * and each replay is a model call charged to us.
 */
describe('replay window', () => {
  function validAt(ts: string): boolean {
    return isValidRequest({ publicKeyHex, signature: signedWith(ts, rawBody), timestamp: ts, rawBody });
  }

  it('accepts a request signed just now', () => {
    expect(validAt(stamp())).toBe(true);
  });

  it('accepts a request from inside the window', () => {
    expect(validAt(stamp(MAX_TIMESTAMP_SKEW_SECONDS - 5))).toBe(true);
  });

  it('rejects a correctly signed request from outside the window', () => {
    // The signature here is genuinely valid — age alone is the reason.
    expect(validAt(stamp(MAX_TIMESTAMP_SKEW_SECONDS + 60))).toBe(false);
  });

  it('rejects a timestamp far in the future', () => {
    // Skew can run either way, so the window is symmetric.
    expect(validAt(stamp(-(MAX_TIMESTAMP_SKEW_SECONDS + 60)))).toBe(false);
  });

  it.each([
    ['a non-numeric timestamp', 'not-a-number'],
    ['a whitespace timestamp', '   '],
    ['an infinite timestamp', 'Infinity'],
  ])('rejects %s', (_label, ts) => {
    // Number('   ') is 0, which would otherwise read as 1970 and be rejected
    // for the wrong reason.
    expect(validAt(ts)).toBe(false);
  });

});
