import { Client, Events, GatewayIntentBits } from 'discord.js';
import { DISCORD_TOKEN } from './config.js';
import { handleInteraction } from './interaction.js';

// Only guild slash commands are used, so no privileged intents are required.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, handleInteraction);

client.login(DISCORD_TOKEN);
