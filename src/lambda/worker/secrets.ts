import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { optionalEnv } from '../../config.js';

/**
 * Resolves the Anthropic API key from Secrets Manager into the environment.
 *
 * `commands/roast/generate.ts` reads `ANTHROPIC_API_KEY` from `process.env`,
 * and it stays that way: the command layer must not learn about AWS. So the
 * worker — the only transport whose key lives in Secrets Manager — fetches the
 * value and puts it where the command already looks.
 *
 * Locally there is no secret to fetch: `.env` sets `ANTHROPIC_API_KEY` and
 * `ANTHROPIC_SECRET_ID` is unset, so this is a no-op.
 */

let client: SecretsManagerClient | undefined;

/**
 * Cached across warm invocations. Secrets Manager is billed per API call and
 * the value changes only on rotation, so refetching on every roast would be
 * both slower and more expensive.
 */
let cached: Promise<void> | undefined;

function getClient(): SecretsManagerClient {
  client ??= new SecretsManagerClient({});
  return client;
}

/**
 * Reads the secret. A JSON secret is unwrapped by key, so a secret written
 * either as a bare string or as `{"ANTHROPIC_API_KEY":"sk-..."}` works — both
 * are shapes the console offers, and picking one to reject is a support
 * question nobody wants to answer at 2am.
 */
async function fetchKey(secretId: string): Promise<string> {
  const { SecretString } = await getClient().send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );

  if (!SecretString) {
    throw new Error(`Secret ${secretId} has no string value.`);
  }

  const trimmed = SecretString.trim();
  if (!trimmed.startsWith('{')) {
    return trimmed;
  }

  const parsed: unknown = JSON.parse(trimmed);
  const value = (parsed as Record<string, unknown>)['ANTHROPIC_API_KEY'];
  if (typeof value !== 'string' || !value) {
    throw new Error(`Secret ${secretId} is JSON without an ANTHROPIC_API_KEY string.`);
  }
  return value;
}

/**
 * Ensures `ANTHROPIC_API_KEY` is set before a command runs.
 *
 * Rejects if the secret cannot be read. The caller runs this inside the
 * worker's follow-up guarantee, so that surfaces as an error message to the
 * user rather than a placeholder that never resolves.
 */
export async function loadAnthropicKey(): Promise<void> {
  // An explicit key wins, so local runs and tests never reach for AWS.
  if (optionalEnv('ANTHROPIC_API_KEY')) {
    return;
  }

  const secretId = optionalEnv('ANTHROPIC_SECRET_ID');
  if (!secretId) {
    // Let the command layer raise the missing-variable error it already knows
    // how to describe, rather than inventing a second vocabulary for it here.
    return;
  }

  cached ??= fetchKey(secretId).then((key) => {
    process.env['ANTHROPIC_API_KEY'] = key;
  });

  try {
    await cached;
  } catch (error) {
    // A failed fetch must not poison every later invocation of a warm
    // container — the next one retries.
    cached = undefined;
    throw error;
  }
}
