import type { CommandRequest, CommandUser } from '../commands/types.js';

/** Interaction types we care about. Discord defines more; we ignore those. */
export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
} as const;

/** Response types we send back. */
export const InteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
} as const;

/** Option types, from Discord's application command option enum. */
const OPTION_TYPE_USER = 6;

/**
 * The parts of an interaction payload this bot reads. Discord sends a great
 * deal more; anything not named here is deliberately ignored.
 */
export interface RawInteraction {
  type: number;
  /** Present on application commands; used to address the follow-up. */
  token?: string;
  application_id?: string;
  data?: {
    name?: string;
    options?: Array<{ name: string; type: number; value?: unknown }>;
    resolved?: {
      users?: Record<string, { id: string; username?: string; global_name?: string | null }>;
      members?: Record<string, { nick?: string | null }>;
    };
  };
}

/** Parses a request body, returning null when it is not usable JSON. */
export function parseInteraction(rawBody: string): RawInteraction | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== 'object' || parsed === null || typeof (parsed as RawInteraction).type !== 'number') {
      return null;
    }
    return parsed as RawInteraction;
  } catch {
    return null;
  }
}

/**
 * Picks the name to roast, matching the gateway's precedence exactly: the
 * per-server nickname, then the global display name, then the username.
 *
 * Over HTTP these arrive as separate `resolved.members` and `resolved.users`
 * maps rather than as objects with getters.
 */
export function resolveDisplayName(interaction: RawInteraction, userId: string): string {
  const user = interaction.data?.resolved?.users?.[userId];
  const nickname = interaction.data?.resolved?.members?.[userId]?.nick;

  return nickname || user?.global_name || user?.username || userId;
}

/**
 * Adapts a raw interaction payload to the transport-agnostic request shape,
 * so commands cannot tell whether they were invoked over HTTP or the gateway.
 */
export function toCommandRequest(interaction: RawInteraction): CommandRequest {
  return {
    commandName: interaction.data?.name ?? '',
    getUser(optionName: string): CommandUser | null {
      const option = interaction.data?.options?.find(
        (candidate) => candidate.name === optionName && candidate.type === OPTION_TYPE_USER,
      );
      if (!option || typeof option.value !== 'string') {
        return null;
      }
      return {
        id: option.value,
        displayName: resolveDisplayName(interaction, option.value),
      };
    },
  };
}
