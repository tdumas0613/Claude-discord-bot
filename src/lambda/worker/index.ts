/**
 * The worker Lambda's entrypoint — the CDK stack points at `handler` in this
 * file, matching `responder/index.ts` so both functions are addressed the same
 * way (`dist/lambda/<function>/index.handler`).
 *
 * Unlike the responder, the worker needs no wiring: it reads no environment
 * itself, and `handler` already answers the user on every path. So this is a
 * re-export, kept as a separate file only so the deployed entrypoint stays put
 * if the worker ever does need setup.
 */
export { handler } from './handler.js';
