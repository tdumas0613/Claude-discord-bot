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
 * True when the signature is valid for this exact body.
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
