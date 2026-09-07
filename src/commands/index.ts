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

/** The command with this name, or undefined if we do not handle it. */
export function findCommand(name: string): BotCommand | undefined {
  return registry.get(name);
}
