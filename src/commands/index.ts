import type { Interaction } from 'discord.js';
import type { BotCommand } from './types.js';
import { roast } from './roast/index.js';

/**
 * Every command the bot knows about, keyed by the name Discord sends back.
 *
 * Adding a command is: create a folder under `commands/`, export a `BotCommand`
 * from its `index.ts`, and add one entry here. Nothing else changes.
 */
const registry: ReadonlyMap<string, BotCommand> = new Map([[roast.definition.name, roast]]);

/** The payloads `npm run register` sends to Discord. */
export const commands = [...registry.values()].map((command) => command.definition);

/**
 * Routes an interaction to the command that owns it. Anything that is not a
 * known chat input command is ignored.
 */
export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = registry.get(interaction.commandName);
  if (!command) {
    return;
  }

  await command.execute(interaction);
}
