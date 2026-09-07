import type {
  APIInteractionDataResolvedGuildMember,
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
  User,
} from 'discord.js';
import { findCommand } from '../commands/index.js';
import type { CommandRequest, CommandUser } from '../commands/types.js';

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

/** Adapts a discord.js interaction to the transport-agnostic request shape. */
export function toCommandRequest(interaction: ChatInputCommandInteraction): CommandRequest {
  return {
    commandName: interaction.commandName,
    getUser(optionName: string): CommandUser | null {
      const user = interaction.options.getUser(optionName);
      if (!user) {
        return null;
      }
      return {
        id: user.id,
        displayName: resolveDisplayName(user, interaction.options.getMember(optionName)),
      };
    },
  };
}

/**
 * Handles a gateway interaction: match the command, acknowledge within the
 * three-second deadline, then edit in the reply once it is ready.
 */
export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = findCommand(interaction.commandName);
  if (!command) {
    return;
  }

  // The API call takes a few seconds; Discord expects a reply within 3.
  await interaction.deferReply();

  const reply = await command.run(toCommandRequest(interaction));
  await interaction.editReply({
    content: reply.content,
    allowedMentions: { users: [...reply.mentions] },
  });
}
