import type {
  APIInteractionDataResolvedGuildMember,
  GuildMember,
  Interaction,
  User,
} from 'discord.js';
import { generateRoast, RoastRefusedError, RoastUnavailableError } from './roast.js';

/** What `ChatInputCommandInteraction#options.getMember` can hand back. */
type ResolvedMember = GuildMember | APIInteractionDataResolvedGuildMember | null;

/**
 * Picks the name to roast: the per-server nickname when there is one, then the
 * global display name, then the username. Nothing else about the user is ever
 * used — the model gets no real information about anyone.
 *
 * A member resolved from the raw API payload carries `nick` rather than the
 * `displayName` getter, so both shapes are handled here.
 */
export function resolveDisplayName(user: User, member: ResolvedMember): string {
  const nickname =
    member === null ? null : 'displayName' in member ? member.displayName : member.nick;

  return nickname ?? user.displayName ?? user.username;
}

/**
 * Handles a single interaction from Discord. Ignores anything that is not the
 * `/roast` chat input command.
 */
export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'roast') {
    return;
  }

  const target = interaction.options.getUser('user', true);
  const displayName = resolveDisplayName(target, interaction.options.getMember('user'));

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
