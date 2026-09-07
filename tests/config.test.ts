import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Neutralize dotenv so a developer's local .env cannot influence these tests.
jest.unstable_mockModule('dotenv/config', () => ({}));

const { MissingConfigError, failFast, optionalEnv, requireEnv } = await import(
  '../src/config.js'
);

const ENV_KEYS = ['DISCORD_TOKEN', 'ANTHROPIC_API_KEY', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const originalEnv: Partial<Record<EnvKey, string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // process.exit would tear down the test runner, so make it observable instead.
  jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
  jest.restoreAllMocks();
});

describe('requireEnv', () => {
  it('returns the value when it is set', () => {
    process.env.DISCORD_TOKEN = 'discord-token';

    expect(requireEnv('DISCORD_TOKEN')).toBe('discord-token');
  });

  it('throws rather than exiting, so Lambda can turn it into a response', () => {
    expect(() => requireEnv('DISCORD_TOKEN')).toThrow(MissingConfigError);
  });

  it('names the missing variable on the error', () => {
    try {
      requireEnv('ANTHROPIC_API_KEY');
      throw new Error('expected requireEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingConfigError);
      expect((error as InstanceType<typeof MissingConfigError>).variable).toBe('ANTHROPIC_API_KEY');
    }
  });

  it('treats an empty value as missing', () => {
    process.env.DISCORD_TOKEN = '';

    expect(() => requireEnv('DISCORD_TOKEN')).toThrow(MissingConfigError);
  });
});

describe('optionalEnv', () => {
  it('returns the value when it is set', () => {
    process.env.DISCORD_GUILD_ID = 'guild-id';

    expect(optionalEnv('DISCORD_GUILD_ID')).toBe('guild-id');
  });

  it('returns null when it is unset', () => {
    expect(optionalEnv('DISCORD_GUILD_ID')).toBeNull();
  });

  it('returns null when it is empty', () => {
    process.env.DISCORD_GUILD_ID = '';

    expect(optionalEnv('DISCORD_GUILD_ID')).toBeNull();
  });
});

describe('failFast', () => {
  it('passes the value through when nothing is missing', () => {
    process.env.DISCORD_TOKEN = 'discord-token';

    expect(failFast(() => requireEnv('DISCORD_TOKEN'))).toBe('discord-token');
  });

  it('exits with the message a CLI user needs', () => {
    expect(() => failFast(() => requireEnv('DISCORD_TOKEN'))).toThrow('process.exit(1)');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing required environment variable DISCORD_TOKEN'),
    );
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('.env.example'));
  });

  it('rethrows anything that is not a configuration problem', () => {
    expect(() =>
      failFast(() => {
        throw new Error('something else entirely');
      }),
    ).toThrow('something else entirely');
  });
});
