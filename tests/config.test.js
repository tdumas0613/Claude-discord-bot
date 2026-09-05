import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Neutralize dotenv so a developer's local .env cannot influence these tests.
jest.unstable_mockModule('dotenv/config', () => ({}));

const ENV_KEYS = [
  'DISCORD_TOKEN',
  'ANTHROPIC_API_KEY',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
];

const originalEnv = {};

/** Imports a fresh copy of config.js against the current environment. */
async function importConfig() {
  jest.resetModules();
  return import('../src/config.js');
}

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
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
  jest.restoreAllMocks();
});

describe('config', () => {
  it('exports the required credentials', async () => {
    process.env.DISCORD_TOKEN = 'discord-token';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    const config = await importConfig();

    expect(config.DISCORD_TOKEN).toBe('discord-token');
    expect(config.ANTHROPIC_API_KEY).toBe('anthropic-key');
  });

  it('defaults the optional variables to null', async () => {
    process.env.DISCORD_TOKEN = 'discord-token';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    const config = await importConfig();

    expect(config.DISCORD_CLIENT_ID).toBeNull();
    expect(config.DISCORD_GUILD_ID).toBeNull();
  });

  it('reads the optional variables when they are set', async () => {
    process.env.DISCORD_TOKEN = 'discord-token';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.DISCORD_CLIENT_ID = 'client-id';
    process.env.DISCORD_GUILD_ID = 'guild-id';

    const config = await importConfig();

    expect(config.DISCORD_CLIENT_ID).toBe('client-id');
    expect(config.DISCORD_GUILD_ID).toBe('guild-id');
  });

  it.each(['DISCORD_TOKEN', 'ANTHROPIC_API_KEY'])(
    'exits when %s is missing',
    async (missing) => {
      process.env.DISCORD_TOKEN = 'discord-token';
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      delete process.env[missing];

      await expect(importConfig()).rejects.toThrow('process.exit(1)');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining(missing));
    },
  );

  it('treats an empty value as missing', async () => {
    process.env.DISCORD_TOKEN = '';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    await expect(importConfig()).rejects.toThrow('process.exit(1)');
  });
});
