import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';
import { DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_TOKEN } from './config.js';

if (!DISCORD_CLIENT_ID) {
  console.error(
    'Missing DISCORD_CLIENT_ID. Add your application ID to .env before deploying commands.',
  );
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

// Guild commands appear instantly and are ideal for development. Global commands
// work in every server the bot is in, but can take up to an hour to propagate.
const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

try {
  const data = await rest.put(route, { body: commands });
  console.log(
    `Registered ${data.length} command(s) ${
      DISCORD_GUILD_ID ? `to guild ${DISCORD_GUILD_ID}` : 'globally'
    }.`,
  );
} catch (error) {
  console.error('Failed to register commands:', error);
  process.exit(1);
}
