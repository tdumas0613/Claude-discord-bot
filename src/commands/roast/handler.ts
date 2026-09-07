import type { CommandReply, CommandRequest } from '../types.js';
import { generateRoast, RoastRefusedError, RoastUnavailableError } from './generate.js';

/**
 * Runs `/roast`. The registry has already matched the command name, and the
 * transport has already resolved the target's display name, so this only deals
 * with the roast itself.
 *
 * Never throws: every failure becomes a reply, because whichever transport
 * called us has a waiting user to answer.
 */
export async function run(request: CommandRequest): Promise<CommandReply> {
  const target = request.getUser('user');
  if (!target) {
    // Discord enforces the option as required, so reaching here means the
    // payload was malformed rather than the user omitting an argument.
    return { content: 'I could not tell who you wanted roasted.', mentions: [] };
  }

  try {
    const roast = await generateRoast(target.displayName);
    return { content: `<@${target.id}> ${roast}`, mentions: [target.id] };
  } catch (error) {
    if (!(error instanceof RoastRefusedError)) {
      console.error('Failed to generate roast:', error);
    }
    return { content: errorMessage(error), mentions: [] };
  }
}

/**
 * Maps a failure to something friendly enough to post in a public channel.
 *
 * Branches on the reason carried by the domain error rather than on SDK
 * exception types — this layer has no Anthropic dependency.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof RoastRefusedError) {
    return "I couldn't come up with anything that stays on the right side of the line. Consider yourself spared.";
  }
  if (error instanceof RoastUnavailableError) {
    switch (error.reason) {
      case 'rate_limited':
        return 'Too many roasts at once — give me a minute to reload.';
      case 'authentication':
        return 'My Claude API key is not working. Someone tell the bot owner.';
      case 'api_error':
        return `The roast factory is down (API error ${error.status}). Try again shortly.`;
      default:
        break;
    }
  }
  return 'Something went wrong writing that roast. Try again shortly.';
}
