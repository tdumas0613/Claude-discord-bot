import { REST, Routes } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { commands } from './commands.js';
import { DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_TOKEN } from './config.js';

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
const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(clientId, DISCORD_GUILD_ID)
  : Routes.applicationCommands(clientId);

try {
  // The REST client returns `unknown`; Discord echoes back the commands it registered.
  const data = (await rest.put(route, {
    body: commands,
  })) as RESTPostAPIChatInputApplicationCommandsJSONBody[];

  console.log(
    `Registered ${data.length} command(s) ${
      DISCORD_GUILD_ID ? `to guild ${DISCORD_GUILD_ID}` : 'globally'
    }.`,
  );
} catch (error) {
  console.error('Failed to register commands:', error);
  process.exit(1);
}
