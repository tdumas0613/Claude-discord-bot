import { DiscordAPIError, REST, Routes } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { commands } from '../commands/index.js';
import { DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_TOKEN } from '../config.js';

const clientId = DISCORD_CLIENT_ID;
if (!clientId) {
  console.error(
    'Missing DISCORD_CLIENT_ID. Add your application ID to .env before deploying commands.',
  );
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

// Guild commands appear instantly and are ideal for development. Global commands
// work in every server the bot is in, but can take up to an hour to propagate.
const target = DISCORD_GUILD_ID ? `guild ${DISCORD_GUILD_ID}` : 'globally (all servers)';
const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(clientId, DISCORD_GUILD_ID)
  : Routes.applicationCommands(clientId);

// Echo the target first: a registration that "succeeds" against the wrong
// application or guild looks identical to one that worked.
console.log(`Registering ${commands.length} command(s) as application ${clientId} → ${target}`);

try {
  // The REST client returns `unknown`; Discord echoes back the commands it registered.
  const data = (await rest.put(route, {
    body: commands,
  })) as RESTPostAPIChatInputApplicationCommandsJSONBody[];

  console.log(`Registered ${data.length} command(s) to ${target}.`);
  if (!DISCORD_GUILD_ID) {
    console.log(
      'Global commands can take up to an hour to appear. Set DISCORD_GUILD_ID to a ' +
        'server ID for instant registration while developing.',
    );
  }
} catch (error) {
  reportFailure(error);
  process.exit(1);
}

/**
 * Discord rejects these requests with an empty body and the placeholder message
 * "No Description", so logging the error object alone tells you nothing. Print
 * the status and route, then name the setting most likely at fault.
 */
function reportFailure(error: unknown): void {
  if (!(error instanceof DiscordAPIError)) {
    console.error('Failed to register commands:', error);
    return;
  }

  const body = JSON.stringify(error.rawError);
  console.error(
    `Failed to register commands: HTTP ${error.status}` +
      (error.code ? ` (Discord code ${error.code})` : '') +
      ` — ${error.message}`,
  );
  console.error(`  Request:  ${error.method} ${error.url}`);
  console.error(`  Response: ${body === '{}' ? '(empty body)' : body}`);
  console.error(`  Likely cause: ${likelyCause(error.status)}`);
}

function likelyCause(status: number): string {
  switch (status) {
    case 401:
      return (
        'DISCORD_TOKEN is not a valid bot token. Copy it from Developer Portal → your ' +
        'app → Bot → Reset Token. The client secret and the public key are different ' +
        'values and will not work here.'
      );
    case 403:
      return DISCORD_GUILD_ID
        ? `The token is not allowed to add commands to guild ${DISCORD_GUILD_ID}. The bot ` +
            'is probably not in that server, or was invited without the ' +
            '"applications.commands" scope. Re-invite it with both "bot" and ' +
            '"applications.commands" selected.'
        : 'The token was rejected for this application. Check that DISCORD_TOKEN and ' +
            'DISCORD_CLIENT_ID belong to the same application.';
    case 404:
      return (
        `Application ${clientId} was not found` +
        (DISCORD_GUILD_ID ? `, or guild ${DISCORD_GUILD_ID} does not exist` : '') +
        '. DISCORD_CLIENT_ID must be the Application ID from Developer Portal → your ' +
        'app → General Information.'
      );
    case 400:
      return 'Discord rejected the command definition itself — see the response body above.';
    case 429:
      return 'Rate limited. Wait a moment and re-run.';
    default:
      return 'See the response body above.';
  }
}
