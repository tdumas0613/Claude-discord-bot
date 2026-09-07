import type { RawInteraction } from './interaction.js';

/**
 * The contract between the two Lambdas: what the responder puts on the wire
 * and what the worker is invoked with.
 *
 * It lives here rather than in either function's folder because both sides
 * depend on it equally — the responder builds it, the worker consumes it, and
 * neither should have to import the other to name it. Changing this shape
 * means deploying both functions together.
 *
 * Deliberately just the interaction payload plus what is needed to address the
 * follow-up.
 */
export interface WorkerEvent {
  applicationId: string;
  interactionToken: string;
  interaction: RawInteraction;
}
