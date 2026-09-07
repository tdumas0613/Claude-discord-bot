import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/**
 * Verifies the Ed25519 signature Discord puts on every interaction request.
 *
 * Discord signs `timestamp + rawBody` with the application's private key and
 * sends the signature in `X-Signature-Ed25519`. An endpoint that does not
 * reject bad signatures will not be accepted in the Developer Portal — Discord
 * sends deliberately invalid ones as a routine check.
 *
 * Node verifies Ed25519 natively, so nothing here needs a dependency, which
 * keeps the responder's bundle small enough to cold-start inside the deadline.
 */

const keyCache = new Map<string, KeyObject>();

/** Turns Discord's hex-encoded public key into a verifying key. */
function toKey(publicKeyHex: string): KeyObject {
  const cached = keyCache.get(publicKeyHex);
  if (cached) {
    return cached;
  }

  const raw = Buffer.from(publicKeyHex, 'hex');
  if (raw.length !== 32) {
    throw new Error('DISCORD_PUBLIC_KEY must be 32 bytes of hex (64 characters).');
  }

  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
  keyCache.set(publicKeyHex, key);
  return key;
}

/**
 * How far Discord's timestamp may be from our clock, in seconds.
 *
 * A signature alone proves a request came from Discord, not that it came from
 * Discord *just now*: without a window, a captured request can be replayed
 * forever, and every replay is a real roast and a real model call charged to
 * us. The signature cannot be revoked short of rotating the application key,
 * so the timestamp is what bounds the damage.
 *
 * Symmetric, because the skew can run either way, and generous next to any
 * cold start while still making a captured request useless within minutes.
 */
export const MAX_TIMESTAMP_SKEW_SECONDS = 300;

/** True when the timestamp is close enough to now to not be a replay. */
function isFresh(timestamp: string): boolean {
  const seconds = Number(timestamp);

  // Number('') is 0 and Number('abc') is NaN. Reject both here rather than
  // letting the first read as 1970 and fail for the wrong reason.
  if (!timestamp.trim() || !Number.isFinite(seconds)) {
    return false;
  }

  return Math.abs(Date.now() / 1000 - seconds) <= MAX_TIMESTAMP_SKEW_SECONDS;
}

/**
 * True when the signature is valid for this exact body, and recent.
 *
 * `rawBody` must be the bytes Discord sent, before any JSON parse and
 * re-stringify — re-serializing changes key order and whitespace, and the
 * signature will not match.
 */
export function isValidRequest({
  publicKeyHex,
  signature,
  timestamp,
  rawBody,
}: {
  publicKeyHex: string;
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: string;
}): boolean {
  if (!signature || !timestamp) {
    return false;
  }

  // Before the cryptography: a stale request is refused whatever it is signed
  // with, and this is far cheaper than a verify.
  if (!isFresh(timestamp)) {
    return false;
  }

  // Buffer.from does not throw on invalid hex — it stops at the first bad pair
  // and returns a short buffer — so the length check is what rejects garbage.
  // Ed25519 signatures are exactly 64 bytes.
  const signatureBytes = Buffer.from(signature, 'hex');
  if (signatureBytes.length !== 64) {
    return false;
  }

  try {
    return verify(null, Buffer.from(timestamp + rawBody), toKey(publicKeyHex), signatureBytes);
  } catch {
    // A malformed key or signature is a failed verification, not a crash.
    return false;
  }
}
