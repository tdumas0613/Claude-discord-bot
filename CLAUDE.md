# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Discord bot with one slash command, `/roast`, that asks the Claude API for a short PG-13
roast of a server member. Small on purpose: six source files, no database, no web server.

## Commands

```bash
npm run typecheck                    # tsc over src/ AND tests/ (tsconfig.json)
npm run build                        # emit src/ -> dist/ (tsconfig.build.json)
npm test                             # full Jest suite
npm test -- tests/roast.test.ts      # one file
npm test -- -t "enables server-side" # one test by name
npm run test:coverage                # coverage (currently 100% on covered modules)
npm start                            # builds first via prestart, then runs dist/index.js
npm run register                     # builds first via preregister, registers /roast
```

`npm test` shells out to `node --experimental-vm-modules node_modules/jest/bin/jest.js`
rather than the `jest` binary — Jest needs that flag for native ESM. The
`ExperimentalWarning: VM Modules` line it prints is expected, not a problem.

Slash commands must be registered with Discord before they appear. `npm run register` writes
to one guild when `DISCORD_GUILD_ID` is set (instant) and globally otherwise (up to an hour
to propagate). Re-run it whenever `src/commands.ts` changes.

## Architecture

Flow: `index.ts` (client + login) → `interaction.ts` (routing, replies) → `roast.ts`
(prompt + API call). `config.ts` sits underneath everything; `commands.ts` is shared
between the bot and `register-slash-commands.ts`.

The split exists for testability. `index.ts` calls `client.login()` at import time, so the
handler lives in `interaction.ts` where a test can import it without touching the network.
Keep it that way — moving logic back into `index.ts` makes it untestable, and `index.ts`
and `register-slash-commands.ts` are excluded from coverage precisely because they act on
import.

`config.ts` calls `process.exit(1)` at import time when a required variable is missing.
Anything importing it transitively (which is nearly everything) will kill the process
without `DISCORD_TOKEN` and `ANTHROPIC_API_KEY` set. Tests mock `../src/config.js` rather
than setting env vars, except `tests/config.test.ts`, which mocks `dotenv/config` and spies
on `process.exit` so a developer's local `.env` cannot influence the result.

## The Claude API call

In `src/roast.ts`. Read the `claude-api` skill before changing it — model IDs and parameter
shapes here are current and easy to "correct" into something stale.

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
`tests/roast.test.ts` — loosening the prompt breaks them, which is intentional.

## TypeScript and ESM gotchas

- **Relative imports carry a `.js` suffix in `.ts` source** (`from './roast.js'`). That is
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

`getMember()` can return either a `GuildMember` (with a `displayName` getter) or a raw
`APIInteractionDataResolvedGuildMember` (with `nick`). `resolveDisplayName` in
`interaction.ts` handles both; it uses an `in` check rather than `instanceof` so plain
object fixtures work in tests.

## CI

`.github/workflows/ci.yml` runs typecheck → build → tests on every push and pull request,
on Node 24 only (the current LTS, also pinned in `.nvmrc` and `engines`). Keep the README's
CI section, `.nvmrc`, and `engines` in sync with the matrix if it changes.

`@types/node` is pinned as a direct devDependency to match the runtime major. Without the
pin it resolves transitively to whatever a dependency happens to pull in, which can describe
a different Node than the one the project runs on.
