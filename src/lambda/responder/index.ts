import { requireEnv } from '../../config.js';
import { dispatchToWorker } from './dispatch.js';
import { createHandler } from './handler.js';
import { isValidRequest } from './signature.js';

/**
 * The Lambda entrypoint behind the Function URL — the CDK stack points at
 * `handler` in this file.
 *
 * Configuration is read on first request rather than at import so a missing
 * variable becomes a 500 with a log line, not a container that fails to
 * initialize on every cold start.
 */

let delegate: ReturnType<typeof createHandler> | undefined;

function build(): ReturnType<typeof createHandler> {
  delegate ??= createHandler({
    publicKeyHex: requireEnv('DISCORD_PUBLIC_KEY'),
    applicationId: requireEnv('DISCORD_CLIENT_ID'),
    dispatch: (event) => dispatchToWorker(requireEnv('WORKER_FUNCTION_NAME'), event),
    isValidRequest,
  });
  return delegate;
}

export const handler = async (request: Parameters<ReturnType<typeof createHandler>>[0]) => {
  try {
    return await build()(request);
  } catch (error) {
    console.error('Responder failed before it could reply:', error);
    return { statusCode: 500, body: 'internal error' };
  }
};
