import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from './config.js';
import { SYSTEM_PROMPT } from './prompt.js';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const MODEL = 'claude-opus-5';

/** Thrown when the model declines to produce a roast. */
export class RoastRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoastRefusedError';
  }
}

/** Why a roast could not be produced, in terms callers can act on. */
export type RoastFailureReason =
  | 'rate_limited'
  | 'authentication'
  | 'api_error'
  | 'empty_response'
  | 'unknown';

/**
 * Thrown when the roast could not be generated for a reason that is not a
 * refusal. This module is the only place that knows about Anthropic SDK error
 * types; callers branch on `reason` instead, so swapping providers stays local
 * to this file.
 */
export class RoastUnavailableError extends Error {
  readonly reason: RoastFailureReason;
  /** HTTP status, when the failure came from an API response. */
  readonly status: number | undefined;

  constructor(reason: RoastFailureReason, message: string, status?: number) {
    super(message);
    this.name = 'RoastUnavailableError';
    this.reason = reason;
    this.status = status;
  }
}

/** Translates an Anthropic SDK failure into this module's own error type. */
function toRoastUnavailable(error: unknown): RoastUnavailableError {
  if (error instanceof Anthropic.RateLimitError) {
    return new RoastUnavailableError('rate_limited', error.message, error.status);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new RoastUnavailableError('authentication', error.message, error.status);
  }
  if (error instanceof Anthropic.APIError) {
    return new RoastUnavailableError('api_error', error.message, error.status);
  }
  return new RoastUnavailableError(
    'unknown',
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Generates a roast for a display name.
 *
 * @param displayName The target's Discord display name.
 * @returns The roast text.
 * @throws {RoastRefusedError} If the model declines to write one.
 * @throws {RoastUnavailableError} For every other failure.
 */
export async function generateRoast(displayName: string): Promise<string> {
  // Display names are user-controlled, so keep them clearly delimited and bounded.
  const name = displayName.slice(0, 100);

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Roasts are short and the model declines a fraction of them; server-side
      // fallbacks re-run a declined request on another model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // A one-liner does not need deep reasoning, and low effort keeps it terse.
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Roast the Discord user whose display name is: <display_name>${name}</display_name>`,
        },
      ],
    });
  } catch (error) {
    throw toRoastUnavailable(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new RoastRefusedError(response.stop_details?.explanation ?? 'Model declined.');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) {
    throw new RoastUnavailableError('empty_response', 'Model returned no text content.');
  }

  return text;
}
