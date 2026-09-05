import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const create = jest.fn();
const constructorOptions = [];

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor(options) {
      constructorOptions.push(options);
      this.beta = { messages: { create } };
    }
  },
}));

// Stub config so the tests never touch a real .env file or exit the process.
jest.unstable_mockModule('../src/config.js', () => ({
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  DISCORD_TOKEN: 'test-discord-token',
  DISCORD_CLIENT_ID: null,
  DISCORD_GUILD_ID: null,
}));

const { generateRoast, RoastRefusedError } = await import('../src/roast.js');

/** Builds a minimal Messages API response. */
function response({ content = [{ type: 'text', text: 'A roast.' }], stop_reason = 'end_turn', stop_details = null } = {}) {
  return { content, stop_reason, stop_details };
}

/** The request body passed to the most recent API call. */
function lastRequest() {
  return create.mock.calls.at(-1)[0];
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
    expect(request.messages[0].role).toBe('user');
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

    expect(lastRequest().messages[0].content).toContain(
      '<display_name>Bartholomew</display_name>',
    );
  });

  it('truncates an overlong display name', async () => {
    create.mockResolvedValue(response());

    await generateRoast('z'.repeat(500));

    const content = lastRequest().messages[0].content;
    expect(content).toContain(`<display_name>${'z'.repeat(100)}</display_name>`);
    expect(content).not.toContain('z'.repeat(101));
  });
});

describe('system prompt guardrails', () => {
  let system;

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
    create.mockResolvedValue(response({ content: [{ type: 'text', text: '  Nice name.  ' }] }));

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
    create.mockResolvedValue(response({ content: [{ type: 'thinking', thinking: 'hmm' }] }));

    await expect(generateRoast('Bartholomew')).rejects.toThrow('no text content');
  });

  it('propagates API errors to the caller', async () => {
    create.mockRejectedValue(new Error('network down'));

    await expect(generateRoast('Bartholomew')).rejects.toThrow('network down');
  });
});
