import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

/**
 * A user referenced by a command option, normalized by the transport.
 *
 * Resolving a display name differs per transport — the gateway hands back
 * discord.js objects, HTTP interactions hand back raw JSON — so each transport
 * does that work and commands see only the result.
 */
export interface CommandUser {
  readonly id: string;
  readonly displayName: string;
}

/**
 * An invocation of a command, independent of how it reached us.
 *
 * `getUser` mirrors discord.js's `options.getUser(name)` so the gateway adapter
 * stays a thin pass-through, but nothing here depends on discord.js at runtime.
 */
export interface CommandRequest {
  readonly commandName: string;
  getUser(optionName: string): CommandUser | null;
}

/** What a command produces, ready for any transport to send. */
export interface CommandReply {
  readonly content: string;
  /** User IDs allowed to be pinged; everything else is suppressed. */
  readonly mentions: readonly string[];
}

/**
 * One slash command: what to register with Discord, and what to do when it is
 * invoked. Each command folder exports a single value of this shape.
 *
 * `run` never throws — it turns failures into a reply, because every transport
 * needs to say something back to the user rather than surface an exception.
 */
export interface BotCommand {
  /** The payload sent to Discord by `npm run register`. */
  readonly definition: RESTPostAPIChatInputApplicationCommandsJSONBody;
  run(request: CommandRequest): Promise<CommandReply>;
}
