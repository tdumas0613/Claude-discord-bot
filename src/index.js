import Anthropic from '@anthropic-ai/sdk';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { DISCORD_TOKEN } from './config.js';
import { generateRoast, RoastRefusedError } from './roast.js';

// Only guild slash commands are used, so no privileged intents are required.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'roast') {
    return;
  }

  const target = interaction.options.getUser('user', true);
  const member = interaction.options.getMember('user');
  // Prefer the per-server nickname when there is one, and never use anything
  // beyond the display name — the model gets no real information about anyone.
  const displayName = member?.displayName ?? target.displayName ?? target.username;

  // The API call takes a few seconds; Discord expects a reply within 3.
  await interaction.deferReply();

  try {
    const roast = await generateRoast(displayName);
    await interaction.editReply({
      content: `${target} ${roast}`,
      allowedMentions: { users: [target.id] },
    });
  } catch (error) {
    await interaction.editReply(errorMessage(error));
    if (!(error instanceof RoastRefusedError)) {
      console.error('Failed to generate roast:', error);
    }
  }
});

/** Maps a failure to something friendly enough to post in a public channel. */
function errorMessage(error) {
  if (error instanceof RoastRefusedError) {
    return "I couldn't come up with anything that stays on the right side of the line. Consider yourself spared.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Too many roasts at once — give me a minute to reload.';
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return 'My Claude API key is not working. Someone tell the bot owner.';
  }
  if (error instanceof Anthropic.APIError) {
    return `The roast factory is down (API error ${error.status}). Try again shortly.`;
  }
  return 'Something went wrong writing that roast. Try again shortly.';
}

client.login(DISCORD_TOKEN);
