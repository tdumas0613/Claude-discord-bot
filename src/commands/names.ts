/**
 * The name of every command the bot answers.
 *
 * Deliberately a plain list that imports nothing. The responder Lambda only
 * needs to know whether a name is one of ours, and asking the registry would
 * pull `discord.js` and the Anthropic SDK — via `roast/command.ts` and
 * `roast/generate.ts` — into the one bundle that has to cold-start inside
 * Discord's three seconds.
 *
 * It is a second place to edit when adding a command, so
 * `tests/commands/names.test.ts` fails if it ever disagrees with the registry.
 */
export const COMMAND_NAMES = ['roast'] as const;

/** True when this is a command the bot handles. */
export function isCommandName(name: string): boolean {
  return (COMMAND_NAMES as readonly string[]).includes(name);
}
