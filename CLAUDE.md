# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Discord bot with one slash command, `/roast`, that asks the Claude API for a short PG-13
roast of a server member. Small on purpose: no database, no web server.

## Commands

```bash
npm run typecheck                    # tsc over src/ AND tests/ (tsconfig.json)
npm run build                        # emit src/ -> dist/ (tsconfig.build.json)
npm test                             # full Jest suite
npm test -- tests/lambda             # one folder
npm test --prefix infra              # CDK stack tests (separate package)
npm test -- -t "enables server-side" # one test by name
npm run test:coverage                # coverage (currently 100% on covered modules)
npm start                            # builds first via prestart, runs dist/bot/index.js
npm run register                     # builds first via preregister, registers /roast
```

`npm test` shells out to `node --experimental-vm-modules node_modules/jest/bin/jest.js`
rather than the `jest` binary — Jest needs that flag for native ESM. The
`ExperimentalWarning: VM Modules` line it prints is expected, not a problem.

Slash commands must be registered with Discord before they appear. `npm run register` writes
to one guild when `DISCORD_GUILD_ID` is set (instant) and globally otherwise (up to an hour
to propagate). Re-run it whenever a command definition changes.

## Architecture

Organized by feature, not by vendor, and by transport at the edges. `src/commands/`
holds one folder per slash command and knows nothing about how an interaction arrived;
`src/bot/` is the Discord gateway transport; `src/lambda/` is the HTTP-interactions
transport; `src/config.ts` sits underneath everything.

```
bot/index.ts  ─┐                                    ┌─ commands/index.ts (registry)
bot/gateway.ts ┼─▶ CommandRequest ─▶ BotCommand.run ┤
lambda/*       ─┘                                   └─ commands/roast/*
```

**The seam is `CommandRequest` / `CommandReply` (`commands/types.ts`).** A transport
resolves the target's display name — the gateway from discord.js objects, Lambda from
raw `resolved.members` / `resolved.users` JSON — and hands over a plain object. A command
returns content plus the user IDs it may ping. `run` never throws: it turns failures into
a reply, because every transport has a waiting user to answer. Do not reintroduce
discord.js types into `commands/`; that dependency is what made Lambda impossible.

Adding a command is a new folder under `commands/` exporting a `BotCommand` from its
`index.ts`, plus one entry in the registry map **and** one in `commands/names.ts`. Do not
add command-specific branching to a transport.

`commands/names.ts` is a duplicate of the registry's keys on purpose. The responder
Lambda needs to know whether a name is ours, and importing the registry to ask would pull
`discord.js` (via `roast/command.ts`) and the Anthropic SDK (via `roast/generate.ts`)
into the bundle with three seconds to cold-start — about 1.5 MB of it. Keep that module
import-free. `tests/commands/names.test.ts` fails if the two disagree.

### The Lambda pair

Discord closes an interaction if the HTTP response takes over 3 seconds, and a roast
takes longer, so acknowledgement and work happen in two invocations:

- `lambda/responder/handler.ts` — verifies the Ed25519 signature, answers PING with
  PONG, invokes the worker asynchronously, then returns a type-5 deferral. Dispatch
  happens *before* deferring so a failed hand-off can still be reported to the user.
- `lambda/worker/handler.ts` — runs the command and PATCHes the result into the deferred
  reply. **Every path must end in a follow-up**: Discord never times the "thinking…"
  placeholder out, so a worker that dies quietly leaves it on screen permanently.

One folder per deployed function, with what only that function needs inside it:
`responder/` owns signature verification and dispatch, `worker/` owns the follow-up
call. What both need stays flat in `lambda/` — `interaction.ts`, and `events.ts` for
the `WorkerEvent` contract the responder writes and the worker reads. A file that
would have to be imported across the two folders belongs at the top level instead.

Each folder's `index.ts` is its deployed entrypoint, so the CDK stack points at
`dist/lambda/responder/index.handler` and `dist/lambda/worker/index.handler`. Keep that
shape when adding a function: entrypoint in `index.ts`, testable logic beside it.

`lambda/responder/signature.ts` uses `node:crypto` only — no dependency. Discord probes the
endpoint with deliberately invalid signatures and will not register a URL that accepts
them, so verify against the *raw* body: parsing and re-serializing changes the bytes and
breaks the signature.

It also enforces a ±`MAX_TIMESTAMP_SKEW_SECONDS` (300s) freshness window. A signature
proves a request came from Discord, not that it came from Discord *now*, and a captured
request would otherwise replay forever — each replay a model call on our bill, through a
signature we cannot revoke without rotating the application key. Because of that window,
tests must build timestamps relative to `Date.now()`; a hardcoded one ages out and starts
failing on its own. `tests/lambda/responder/endpoint.test.ts` drives the real
`isValidRequest` through a Function-URL-shaped request and is the closest thing to
Discord's own registration probe — the rest of the responder tests mock verification.

`lambda/worker/secrets.ts` resolves `ANTHROPIC_API_KEY` from Secrets Manager into
`process.env` before the command runs, because `commands/roast/generate.ts` reads it from
there and must not learn about AWS. It is called from inside `worker/handler.ts`'s try
block, not from `worker/index.ts`: an unreadable secret has to reach the user as a
message like any other failure. An `ANTHROPIC_API_KEY` already in the environment always
wins, so local runs and tests never reach for AWS.

`lambda/worker/discord-api.ts` is the follow-up call. It is the same route discord.js reaches
through `interaction.editReply` (`InteractionWebhook` → `/webhooks/{app}/{token}
/messages/@original`), authorized by the interaction token, valid 15 minutes. No bot
token is involved.

Everything outside `src/bot/`, the two `lambda/*/index.ts` entrypoints and
`lambda/responder/dispatch.ts` is importable without side effects; those are entrypoints
or vendor wiring and are excluded from coverage.

The Anthropic SDK is imported in exactly ONE file: `commands/roast/generate.ts`. It
translates SDK exceptions into `RoastUnavailableError` with a `reason`; transports branch
on that reason. Do not import `@anthropic-ai/sdk` anywhere else — that boundary is the
point, and `tests/anthropic-contract.test.ts` guards the class hierarchy it relies on.

`config.ts` exports `requireEnv` (throws `MissingConfigError`), `optionalEnv`, and
`failFast` for CLI entrypoints. It must **not** `process.exit` at import: in Lambda that
turns a fixable configuration mistake into a container crash. `generate.ts` builds its
Anthropic client lazily for the same reason.

## Infrastructure

`infra/` is a CDK app in its own npm package, with its own `package.json`, lock file and
`node_modules`. That is deliberate: `aws-cdk-lib` stays out of the bot's dependency tree,
out of its Lambda bundles, and out of what the SCA job audits. It is also CommonJS, unlike
the bot — the CDK default, and what `cdk.json`'s ts-node invocation expects.

```bash
npm ci --prefix infra
npm test --prefix infra          # stack assertions; no AWS account needed
npm run synth --prefix infra     # the real check: runs esbuild over both entrypoints
```

`esbuild` is a devDependency of the **root** package, not just `infra/`. CDK runs
`npx --no-install esbuild` with `projectRoot` as the working directory, and projectRoot is
the repository root because that is where the Lambda sources and their dependencies are.
Without it, bundling silently falls back to Docker.

`lib/bot-stack.ts` holds both functions. Things there that are load-bearing:

- Both entrypoints are `src/lambda/*/index.ts`. Bundling per entry is what keeps the
  responder small — check with `npm run synth --prefix infra` and look at the reported
  sizes; the responder should stay well under a megabyte.
- The Function URL is `FunctionUrlAuthType.NONE` and must stay that way. Discord signs
  with Ed25519 and cannot produce SigV4, so `responder/signature.ts` is the only guard.
- The Anthropic secret is *referenced*, never created (`Secret.fromSecretNameV2`), so the
  key stays out of the template and out of `cdk diff`.
- `externalModules: []` bundles the AWS SDK rather than trusting the runtime's copy.
- **Reserved concurrency**: 20 responder, 10 worker. It is what bounds the cost of a
  public unauthenticated URL. Do not lower the worker's casually — it is invoked
  asynchronously and Lambda retries throttled events with backoff, but the interaction
  token dies 15 minutes after the interaction, and an event throttled past that produces
  a follow-up Discord rejects, leaving the placeholder on screen forever.
- The worker has an SQS `onFailure` destination for invocations that fail through every
  retry. Nothing polls it; it is a place to look, surfaced as `WorkerFailureQueueUrl`.

A deploy may fail on minimum unreserved concurrency if the account's limit is low — AWS
requires 100 to stay unreserved. Lower the reservations or raise the quota; do not remove
them.

`test/bot-stack.test.ts` asserts properties, not a snapshot: a snapshot would break on
every CDK upgrade without telling us anything. It stubs bundling with the
`aws:cdk:bundling-stacks: []` context so the tests do not run esbuild.

## The Claude API call

In `src/commands/roast/generate.ts`. Read the `claude-api` skill before changing it —
model IDs and parameter shapes here are current and easy to "correct" into something stale.

- Model is `claude-opus-5`. Do not swap it for a cheaper model without being asked.
- `output_config: { effort: 'low' }` — a one-liner needs no deep reasoning. `budget_tokens`
  does not exist on this model and returns a 400.
- Server-side refusal fallbacks are on: `betas: ['server-side-fallback-2026-07-01']` with
  `fallbacks: 'default'`. This requires `client.beta.messages.create`, not
  `client.messages.create`. The scalar `'default'` form pairs with the `-07-01` beta; the
  array form pairs with `-06-01`, and mixing them returns a 400.
- Always check `stop_reason === 'refusal'` before reading `content` — a refusal is an HTTP
  200 with no text. `generateRoast` converts it to `RoastRefusedError`, and the handler
  turns that into a harmless in-channel message instead of an error.

The model receives **only the target's display name**, wrapped in `<display_name>` tags and
truncated to 100 characters. Display names are attacker-controlled; keep them delimited and
bounded. The system prompt's hard limits (protected traits, slurs, sexual content,
real-world tragedy, no inventing biographical facts) are asserted by tests in
`tests/commands/roast/generate.test.ts` — loosening the prompt breaks them, which is
intentional. The prompt text itself lives in `commands/roast/prompt.ts`.

## TypeScript and ESM gotchas

- **Relative imports carry a `.js` suffix in `.ts` source** (`from './generate.js'`). That is
  correct for `NodeNext`, not a mistake. `jest.config.ts` maps it back to the `.ts` file.
- **TypeScript is pinned to 6.x.** ts-jest declares `typescript >=4.3 <7`, so TS 7 breaks
  the test toolchain. Moving to 7 means changing test runners or waiting on ts-jest.
- **`tsconfig.json` has `noEmit: true`** and covers src + tests; `tsconfig.build.json`
  extends it and flips `noEmit` off. Typecheck and build are separate commands, and CI
  runs both — a change that compiles is not necessarily one that type-checks the tests.

## Test patterns

ESM mocking is order-sensitive. `jest.unstable_mockModule(...)` must run **before** the
module under test is loaded, which means the module under test is pulled in with top-level
`await import('../src/x.js')`, never a static import. Copy the shape from an existing test
file rather than inventing a new one.

Display-name resolution lives in each transport and must stay consistent between them:
nickname, then global display name, then username. `bot/gateway.ts` handles discord.js's
two member shapes (`GuildMember` with a `displayName` getter, or a raw
`APIInteractionDataResolvedGuildMember` with `nick`) using an `in` check rather than
`instanceof`, so plain object fixtures work in tests. `lambda/interaction.ts` does the
same job from the raw JSON maps.

## CI

`.github/workflows/ci.yml` runs typecheck → build → tests on every push and pull request,
on Node 24 only (the current LTS, also pinned in `.nvmrc` and `engines`). Keep the README's
CI section, `.nvmrc`, and `engines` in sync with the matrix if it changes.

Security scanning is split by what it looks at:

- **SCA** — the `sca` job in `ci.yml`. `npm audit --audit-level=high` scans the whole
  installed tree on every push; `dependency-review-action` additionally reviews what a PR
  *adds*, on pull requests only. Both fail the build at high or critical. A blocked build
  means bump the dependency — do not add an ignore without asking.
- **SAST** — `.github/workflows/codeql.yml`, on pushes to `main`, all PRs, and weekly.
  Analyzes `javascript-typescript` and `actions` (the workflow files). Results go to the
  Security tab; CodeQL does not fail the build unless branch protection is set to require
  it. `build-mode: none` is correct here — nothing needs compiling to build the database.

The two workflows are deliberately separate: CodeQL needs `security-events: write`, and
that permission should not be granted to the job that runs the test suite.

`@types/node` is pinned as a direct devDependency to match the runtime major. Without the
pin it resolves transitively to whatever a dependency happens to pull in, which can describe
a different Node than the one the project runs on.
