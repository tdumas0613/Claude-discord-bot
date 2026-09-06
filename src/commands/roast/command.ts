import { SlashCommandBuilder } from 'discord.js';

/** The `/roast` slash command definition, registered with Discord. */
export const roastCommand = new SlashCommandBuilder()
  .setName('roast')
  .setDescription('Generate a short, playful roast of someone.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The victim')
      .setRequired(true),
  );
