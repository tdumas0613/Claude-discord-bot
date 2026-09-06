import type { BotCommand } from '../types.js';
import { roastCommand } from './command.js';
import { execute } from './handler.js';

/** The `/roast` command, as the registry sees it. */
export const roast: BotCommand = {
  definition: roastCommand.toJSON(),
  execute,
};
