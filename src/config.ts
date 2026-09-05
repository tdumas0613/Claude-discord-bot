import 'dotenv/config';

/**
 * Reads a required environment variable, failing fast with a clear message
 * instead of letting the bot crash later with an opaque 401.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing required environment variable ${name}. ` +
        'Copy .env.example to .env and fill it in.',
    );
    process.exit(1);
  }
  return value;
}

export const DISCORD_TOKEN: string = required('DISCORD_TOKEN');
export const ANTHROPIC_API_KEY: string = required('ANTHROPIC_API_KEY');

// Optional: set to register commands to a single guild for instant updates
// during development. Leave unset to register globally.
export const DISCORD_GUILD_ID: string | null = process.env.DISCORD_GUILD_ID ?? null;

// Only needed by the command deployment script.
export const DISCORD_CLIENT_ID: string | null = process.env.DISCORD_CLIENT_ID ?? null;
