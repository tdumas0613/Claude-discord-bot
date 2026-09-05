import { SlashCommandBuilder } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

export const roastCommand = new SlashCommandBuilder()
  .setName('roast')
  .setDescription('Generate a short, playful roast of someone.')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The victim')
      .setRequired(true),
  );

export const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  roastCommand.toJSON(),
];
