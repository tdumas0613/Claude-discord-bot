import { findCommand } from '../commands/index.js';
import {
  InteractionResponseType,
  InteractionType,
  parseInteraction,
  toCommandRequest,
} from './interaction.js';
import type { WorkerEvent } from './worker.js';

/**
 * The slice of a Lambda Function URL request this handler reads (payload
 * format 2.0). Declared locally rather than pulling in `@types/aws-lambda`,
 * which would add a dependency for four fields.
 */
export interface FunctionUrlRequest {
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
}

export interface FunctionUrlResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

export interface ResponderDeps {
  /** Discord application public key, hex encoded, from the Developer Portal. */
  publicKeyHex: string;
  applicationId: string;
  /** Starts the slow work. Must return quickly; it does not await the result. */
  dispatch(event: WorkerEvent): Promise<void>;
  /** Verifies the Ed25519 signature. Injected so tests can exercise both paths. */
  isValidRequest(input: {
    publicKeyHex: string;
    signature: string | undefined;
    timestamp: string | undefined;
    rawBody: string;
  }): boolean;
}

function json(statusCode: number, payload: unknown): FunctionUrlResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/**
 * Builds the Function URL handler.
 *
 * Everything here runs inside Discord's three-second budget, so it does no
 * network work beyond handing the job to the worker. The actual roast happens
 * in a separate invocation and arrives later as an edit to the deferred reply.
 */
export function createHandler(deps: ResponderDeps) {
  return async function handler(request: FunctionUrlRequest): Promise<FunctionUrlResponse> {
    // The signature covers the exact bytes Discord sent. Parsing and
    // re-serializing would change them, so verify before touching the JSON.
    const rawBody = request.isBase64Encoded
      ? Buffer.from(request.body ?? '', 'base64').toString('utf8')
      : (request.body ?? '');

    const headers = request.headers ?? {};
    const valid = deps.isValidRequest({
      publicKeyHex: deps.publicKeyHex,
      signature: headers['x-signature-ed25519'],
      timestamp: headers['x-signature-timestamp'],
      rawBody,
    });

    // Discord probes with deliberately bad signatures and requires a 401.
    if (!valid) {
      return { statusCode: 401, body: 'invalid request signature' };
    }

    const interaction = parseInteraction(rawBody);
    if (!interaction) {
      return { statusCode: 400, body: 'malformed interaction payload' };
    }

    if (interaction.type === InteractionType.Ping) {
      return json(200, { type: InteractionResponseType.Pong });
    }

    if (interaction.type !== InteractionType.ApplicationCommand) {
      return { statusCode: 400, body: 'unsupported interaction type' };
    }

    const { commandName } = toCommandRequest(interaction);
    if (!findCommand(commandName)) {
      return json(200, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: 'I do not know that command.' },
      });
    }

    if (!interaction.token) {
      return { statusCode: 400, body: 'interaction is missing its token' };
    }

    // Hand off before deferring: if the worker cannot be reached, say so now
    // rather than leaving a placeholder that nothing will ever edit.
    try {
      await deps.dispatch({
        applicationId: interaction.application_id ?? deps.applicationId,
        interactionToken: interaction.token,
        interaction,
      });
    } catch (error) {
      console.error('Could not dispatch the roast to the worker:', error);
      return json(200, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: 'Something went wrong writing that roast. Try again shortly.' },
      });
    }

    return json(200, { type: InteractionResponseType.DeferredChannelMessageWithSource });
  };
}
