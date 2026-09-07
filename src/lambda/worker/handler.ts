import { findCommand } from '../../commands/index.js';
import type { WorkerEvent } from '../events.js';
import { toCommandRequest } from '../interaction.js';
import { editOriginalResponse } from './discord-api.js';

/** Shown when the command itself blew up in a way `run` could not absorb. */
const UNEXPECTED_FAILURE = 'Something went wrong writing that roast. Try again shortly.';

/**
 * Runs the command and edits the result into the deferred reply.
 *
 * Every path must end in a follow-up. Discord never times the placeholder out,
 * so a worker that dies quietly leaves "thinking…" on screen permanently —
 * which is worse than an error message.
 */
export async function handler(event: WorkerEvent): Promise<void> {
  const { applicationId, interactionToken, interaction } = event;

  let content = UNEXPECTED_FAILURE;
  let mentions: readonly string[] = [];

  try {
    const request = toCommandRequest(interaction);
    const command = findCommand(request.commandName);

    if (command) {
      const reply = await command.run(request);
      content = reply.content;
      mentions = reply.mentions;
    } else {
      // The responder only defers for known commands, so this is a bug rather
      // than user error — say something rather than leaving the placeholder.
      console.error(`No handler registered for command: ${request.commandName}`);
      content = 'That command is not wired up on my end.';
    }
  } catch (error) {
    // `run` is documented not to throw; if it did, still answer the user.
    console.error('Command threw instead of returning a reply:', error);
  }

  await editOriginalResponse({ applicationId, interactionToken, content, mentions });
}
