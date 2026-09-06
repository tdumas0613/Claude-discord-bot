import { describe, expect, it } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';

/**
 * `src/roast.ts` translates SDK exceptions into its own error type by checking
 * `instanceof Anthropic.RateLimitError` and friends. `tests/roast.test.ts`
 * mocks the SDK, so on its own it would keep passing even if the real package
 * renamed those classes or changed their hierarchy. This file uses the real
 * package to check the assumptions that translation depends on.
 */
describe('Anthropic SDK error contract', () => {
  it('exports the error classes roast.ts branches on', () => {
    expect(typeof Anthropic.APIError).toBe('function');
    expect(typeof Anthropic.RateLimitError).toBe('function');
    expect(typeof Anthropic.AuthenticationError).toBe('function');
  });

  it('makes the specific errors subclasses of APIError', () => {
    // The translation checks the specific classes first and falls back to
    // APIError, which only works if the specific ones extend it.
    const rateLimit = new Anthropic.RateLimitError(429, undefined, 'slow', new Headers());
    const auth = new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers());

    expect(rateLimit).toBeInstanceOf(Anthropic.APIError);
    expect(auth).toBeInstanceOf(Anthropic.APIError);
  });

  it('carries the HTTP status the reply message reports', () => {
    const error = new Anthropic.InternalServerError(503, undefined, 'oops', new Headers());

    expect(error).toBeInstanceOf(Anthropic.APIError);
    expect(error.status).toBe(503);
  });
});
