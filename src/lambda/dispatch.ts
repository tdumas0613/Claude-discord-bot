import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { WorkerEvent } from './worker.js';

/**
 * Starts the worker without waiting for it.
 *
 * `InvocationType: 'Event'` returns as soon as Lambda has accepted the payload,
 * which is what keeps the responder inside Discord's three-second budget.
 * Asynchronous invocation also brings two automatic retries and an optional
 * on-failure destination, which is why this is a plain invoke rather than a
 * queue.
 */

let lambda: LambdaClient | undefined;

function getClient(): LambdaClient {
  // Reused across warm invocations so the SDK's connection pool survives.
  lambda ??= new LambdaClient({});
  return lambda;
}

export async function dispatchToWorker(
  functionName: string,
  event: WorkerEvent,
): Promise<void> {
  await getClient().send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(event)),
    }),
  );
}
