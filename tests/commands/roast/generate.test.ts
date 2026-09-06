import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/** The subset of the Messages API request this suite asserts on. */
interface RoastRequest {
  model: string;
  max_tokens: number;
  betas: string[];
  fallbacks: string;
  output_config: { effort: string };
  system: string;
  messages: Array<{ role: string; content: string }>;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string };

/** The subset of the Messages API response this suite stubs. */
interface RoastResponse {
  content: ContentBlock[];
  stop_reason: string;
  stop_details: { type: string; category: string; explanation: string } | null;
}

const create = jest.fn<(params: RoastRequest) => Promise<RoastResponse>>();
const constructorOptions: unknown[] = [];

// `roast.ts` branches on `instanceof Anthropic.RateLimitError` and friends, so
// the double has to carry the same class hierarchy the real SDK exposes —
// otherwise `instanceof undefined` throws. `tests/anthropic-contract.test.ts`
// checks that hierarchy against the real package.
class MockAPIError extends Error {
  readonly status: number | undefined;

  constructor(status: number | undefined, message: string) {
    super(message);
    this.status = status;
  }
}
class MockRateLimitError extends MockAPIError {}
class MockAuthenticationError extends MockAPIError {}

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    static APIError = MockAPIError;
    static RateLimitError = MockRateLimitError;
    static AuthenticationError = MockAuthenticationError;

    beta = { messages: { create } };

    constructor(options: unknown) {
      constructorOptions.push(options);
    }
  },
}));

// Stub config so the tests never touch a real .env file or exit the process.
jest.unstable_mockModule('../../../src/config.js', () => ({
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  DISCORD_TOKEN: 'test-discord-token',
  DISCORD_CLIENT_ID: null,
  DISCORD_GUILD_ID: null,
}));

const { generateRoast, RoastRefusedError } = await import('../../../src/commands/roast/generate.js');

/** Builds a minimal Messages API response. */
function response({
  content = [{ type: 'text', text: 'A roast.' }] as ContentBlock[],
  stop_reason = 'end_turn',
  stop_details = null as RoastResponse['stop_details'],
} = {}): RoastResponse {
  return { content, stop_reason, stop_details };
}

/** The request body passed to the most recent API call. */
function lastRequest(): RoastRequest {
  const call = create.mock.calls.at(-1);
  if (!call) {
    throw new Error('expected the Messages API to have been called');
  }
  return call[0];
}

beforeEach(() => {
  create.mockReset();
});

describe('generateRoast request', () => {
  it('passes the configured API key to the client', () => {
    expect(constructorOptions[0]).toEqual({ apiKey: 'test-anthropic-key' });
  });

  it('calls the Messages API with the expected model and options', async () => {
    create.mockResolvedValue(response());

    await generateRoast('Bartholomew');

    expect(create).toHaveBeenCalledTimes(1);
    const request = lastRequest();
    expect(request.model).toBe('claude-opus-5');
    expect(request.max_tokens).toBeGreaterThan(0);
    expect(request.output_config).toEqual({ effort: 'low' });
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.role).toBe('user');
  });

  it('enables server-side refusal fallbacks', async () => {
    create.mockResolvedValue(response());

    await generateRoast('Bartholomew');

    const request = lastRequest();
    expect(request.betas).toContain('server-side-fallback-2026-07-01');
    expect(request.fallbacks).toBe('default');
  });

  it('sends the display name delimited inside the user message', async () => {
    create.mockResolvedValue(response());

    await generateRoast('Bartholomew');

    expect(lastRequest().messages[0]?.content).toContain(
      '<display_name>Bartholomew</display_name>',
    );
  });

  it('truncates an overlong display name', async () => {
    create.mockResolvedValue(response());

    await generateRoast('z'.repeat(500));

    const content = lastRequest().messages[0]?.content ?? '';
    expect(content).toContain(`<display_name>${'z'.repeat(100)}</display_name>`);
    expect(content).not.toContain('z'.repeat(101));
  });
});

describe('system prompt guardrails', () => {
  let system: string;

  beforeEach(async () => {
    create.mockResolvedValue(response());
    await generateRoast('Bartholomew');
    system = lastRequest().system.toLowerCase();
  });

  it.each([
    ['race', 'race'],
    ['religion', 'religion'],
    ['disability', 'disability'],
    ['gender identity', 'gender identity'],
    ['sexual orientation', 'sexual orientation'],
    ['slurs', 'slurs'],
  ])('forbids jokes about %s', (_label, term) => {
    expect(system).toContain(term);
  });

  it('states the PG-13 bar', () => {
    expect(system).toContain('pg-13');
  });

  it('forbids inventing real facts about the target', () => {
    expect(system).toMatch(/do not invent or imply real biographical facts/);
  });

  it('tells the model to ignore display names crafted as bait', () => {
    expect(system).toContain('bait');
  });
});

describe('generateRoast response handling', () => {
  it('returns the trimmed text of the response', async () => {
    create.mockResolvedValue(
      response({ content: [{ type: 'text', text: '  Nice name.  ' }] }),
    );

    await expect(generateRoast('Bartholomew')).resolves.toBe('Nice name.');
  });

  it('joins multiple text blocks and ignores non-text blocks', async () => {
    create.mockResolvedValue(
      response({
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'Part one. ' },
          { type: 'text', text: 'Part two.' },
        ],
      }),
    );

    await expect(generateRoast('Bartholomew')).resolves.toBe('Part one. Part two.');
  });

  it('throws RoastRefusedError when the model declines', async () => {
    create.mockResolvedValue(
      response({
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'harassment', explanation: 'Declined.' },
      }),
    );

    await expect(generateRoast('Bartholomew')).rejects.toThrow(RoastRefusedError);
  });

  it('still throws RoastRefusedError when stop_details is absent', async () => {
    create.mockResolvedValue(response({ content: [], stop_reason: 'refusal' }));

    await expect(generateRoast('Bartholomew')).rejects.toBeInstanceOf(RoastRefusedError);
  });

  it('throws when the response carries no text', async () => {
    create.mockResolvedValue(
      response({ content: [{ type: 'thinking', thinking: 'hmm' }] }),
    );

    await expect(generateRoast('Bartholomew')).rejects.toThrow('no text content');
  });

  it('propagates API errors to the caller', async () => {
    create.mockRejectedValue(new Error('network down'));

    await expect(generateRoast('Bartholomew')).rejects.toThrow('network down');
  });
});

describe('SDK error translation', () => {
  it.each([
    ['rate limits', new MockRateLimitError(429, 'slow down'), 'rate_limited', 429],
    ['auth failures', new MockAuthenticationError(401, 'bad key'), 'authentication', 401],
    ['other API errors', new MockAPIError(503, 'oops'), 'api_error', 503],
  ])('translates %s into a RoastUnavailableError', async (_label, thrown, reason, status) => {
    create.mockRejectedValue(thrown);

    await expect(generateRoast('Bartholomew')).rejects.toMatchObject({
      name: 'RoastUnavailableError',
      reason,
      status,
    });
  });

  it('translates an unrecognized failure into reason "unknown"', async () => {
    create.mockRejectedValue(new Error('network down'));

    await expect(generateRoast('Bartholomew')).rejects.toMatchObject({
      name: 'RoastUnavailableError',
      reason: 'unknown',
      message: 'network down',
    });
  });

  it('stringifies a thrown value that is not an Error', async () => {
    create.mockRejectedValue('socket hang up');

    await expect(generateRoast('Bartholomew')).rejects.toMatchObject({
      name: 'RoastUnavailableError',
      reason: 'unknown',
      message: 'socket hang up',
    });
  });

  it('reports an empty response as reason "empty_response"', async () => {
    create.mockResolvedValue(response({ content: [] }));

    await expect(generateRoast('Bartholomew')).rejects.toMatchObject({
      name: 'RoastUnavailableError',
      reason: 'empty_response',
    });
  });

  it('keeps refusals distinct from unavailability', async () => {
    create.mockResolvedValue(response({ content: [], stop_reason: 'refusal' }));

    await expect(generateRoast('Bartholomew')).rejects.toBeInstanceOf(RoastRefusedError);
  });
});
