import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

/**
 * One slash command: what to register with Discord, and what to do when it is
 * invoked. Each command folder exports a single value of this shape, so the
 * registry never needs to know how a command is put together internally.
 */
export interface BotCommand {
  /** The payload sent to Discord by `npm run register`. */
  readonly definition: RESTPostAPIChatInputApplicationCommandsJSONBody;
  /** Runs the command. Routing has already matched the name. */
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
