# Claude Discord Roast Bot

Someone types `/roast @friend`, and a few seconds later the bot posts a one-liner at their
expense. That's the whole product.

The interesting constraint is what the model is allowed to know. It gets **one thing**: the
target's display name. No message history, no profile, no server context. So it can't dig
up anything real about anyone — it can only riff on the name itself and on obviously
invented nonsense. That's a deliberate design choice, not a limitation to fix later.

---

## Using it

```
/roast user:@someone
```

The bot thinks for a moment (Discord shows it as "thinking…"), then replies in-channel,
mentioning the person being roasted.

Occasionally Claude will decline to write one — usually when a display name is engineered
to bait it into something ugly. When that happens the bot posts a light "consider yourself
spared" message instead of an error, and the joke lands anyway.

## Before you turn it loose

This bot is designed to be funny at someone's expense, which means it's worth a minute of
thought before you drop it into a busy server.

The system prompt does real work here. It bans jokes about race, religion, disability,
gender, sexual orientation, appearance, and the other usual protected traits; it bans
slurs, sexual content, violence and real-world tragedy; and it forbids the model from
inventing biographical claims about a real person. Display names crafted to bait the model
get roasted for *being* that kind of name, rather than taken as an invitation.

That's strong, but a prompt is not a guarantee. Two things worth doing on a public server:

- Restrict who can run `/roast` using Discord's per-command permissions.
- Give people an obvious way to tell you when something lands badly — and be willing to
  pull the command if it does.

If you'd rather nobody could be roasted without opting in, that's a change to
`src/commands/roast/handler.ts`, and a reasonable one.

## What it costs

Every `/roast` is a live Claude API call billed to your own Anthropic key — this is not
free to run.

At current [Claude Opus 5 pricing](https://platform.claude.com/docs/en/pricing) ($5 per
million input tokens, $25 per million output), a single roast works out to roughly **half a
cent to two cents**. The prompt is small and fixed at about 480 input tokens; almost all the variation
is in how much the model thinks before answering. Treat that as an order-of-magnitude
estimate rather than a quote — it's derived from the prompt size and published rates, not
measured against a real bill.

For a small server that's pocket change. For a server where a few hundred people discover
the command on the same afternoon, it's worth watching. Anthropic's console has spend
limits; use them.

## Requirements

- Node.js 24 (the current LTS) or newer — the version is recorded in `.nvmrc`
- A Discord application with a bot user
- An Anthropic API key

## Setup

Short version below. For a step-by-step walkthrough — creating the Discord application,
making the bot private, inviting it, and troubleshooting — see **[SETUP.md](SETUP.md)**.

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Discord application**

   In the [Discord Developer Portal](https://discord.com/developers/applications), create
   an application, add a Bot user, and copy:
   - the **bot token** (Bot → Reset Token)
   - the **application ID** (General Information)

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in `DISCORD_TOKEN`, `ANTHROPIC_API_KEY`, and `DISCORD_CLIENT_ID`. Optionally set
   `DISCORD_GUILD_ID` to a test server ID so command updates appear instantly.

4. **Invite the bot**

   In the Developer Portal, go to OAuth2 → URL Generator, select the `bot` and
   `applications.commands` scopes, and open the generated URL. No privileged gateway
   intents are needed.

5. **Register the slash command**

   ```bash
   npm run register
   ```

   With `DISCORD_GUILD_ID` set, the command registers to that server and is available
   immediately. Without it, the command registers globally and can take up to an hour to
   appear. Re-run this whenever the command definition changes.

6. **Start the bot**

   ```bash
   npm start
   ```

---

# Under the hood

Everything below is for people reading or changing the code.

## How a roast happens

`bot/index.ts` logs in and hands every interaction to the registry in `commands/index.ts`,
which matches the command name and calls that command's `execute`. For `/roast` that is
`commands/roast/handler.ts`: it works out which name to use and defers the reply — Discord
wants an acknowledgement within three seconds, and the API call takes longer — then calls
`commands/roast/generate.ts` and posts whatever comes back.

```
src/
  bot/
    index.ts                    entrypoint: creates the client, logs in
    register-slash-commands.ts  entrypoint: npm run register
  commands/
    index.ts                    registry + router: name -> command
    types.ts                    the BotCommand shape each command exports
    roast/
      index.ts                  the command as the registry sees it
      command.ts                slash command definition
      handler.ts                runs /roast, formats replies
      generate.ts               the Claude API call
      prompt.ts                 the system prompt
  config.ts                     environment variables
```

Adding a second command is: a new folder under `commands/`, exporting a `BotCommand`
from its `index.ts`, plus one line in `commands/index.ts`. Nothing else changes.

`src/bot/` holds the two entrypoints — they act on import (logging in, calling Discord's
REST API), which is exactly why everything else lives outside them and can be imported by a
test without touching the network. Worth preserving.

The Anthropic SDK is imported in exactly one file, `commands/roast/generate.ts`. It
translates SDK exceptions into a `RoastUnavailableError` carrying a `reason`, so the
Discord-facing code never sees a vendor type.

Picking the name to roast is fiddlier than it looks: Discord may hand back either a full
`GuildMember` with a `displayName` getter, or a raw resolved member carrying `nick`.
`resolveDisplayName` handles both, then falls back to the global display name and finally
the username.

## The Claude API call

The request uses `claude-opus-5` at low effort — a one-liner needs no deep reasoning, and
low effort keeps it terse. Server-side refusal fallbacks are enabled, so a request the
model declines is automatically retried on a fallback model inside the same call. If the
whole chain still declines, the response comes back with `stop_reason: "refusal"` and no
text, which becomes the "consider yourself spared" reply rather than an error.

The display name is wrapped in `<display_name>` tags and truncated to 100 characters before
it reaches the prompt. Display names are user-controlled input, so they stay delimited and
bounded.

## TypeScript

Written in TypeScript under `strict` mode and compiled with `tsc`:

```bash
npm run typecheck   # tsc over src/ and tests/, no output
npm run build       # compile src/ to dist/
```

`npm start` and `npm run register` build first (via `prestart` / `preregister`) and then
run the compiled output from `dist/`, so a fresh clone works without a separate build step.

Two config files: `tsconfig.json` type-checks everything including tests, and
`tsconfig.build.json` extends it to emit `src/` into `dist/`. Module resolution is
`NodeNext`, so relative imports carry the `.js` suffix in the TypeScript source — that is
correct for native ESM, and Jest maps it back to the `.ts` file on disk.

TypeScript is pinned to 6.x because ts-jest currently declares `typescript >=4.3 <7`.

## Tests

```bash
npm test                             # run the suite once
npm test -- tests/roast.test.ts      # a single file
npm test -- -t "enables server-side" # a single test by name
npm run test:watch                   # re-run on change
npm run test:coverage                # run with a coverage report
```

The suite is [Jest](https://jestjs.io/) with [ts-jest](https://kulshekhar.github.io/ts-jest/),
running against native ES modules — which is why the scripts invoke Jest through
`node --experimental-vm-modules` rather than the `jest` binary directly. Tests live in
`tests/` and cover the command definition, the shape of the Claude request (model, effort,
fallbacks, prompt guardrails, display-name handling), the interaction handler's reply and
failure paths, and config validation. No test makes a network call: the Anthropic SDK and
Discord interaction are stubbed.

Note that the prompt's guardrails are asserted by tests — loosening the system prompt will
fail the suite, which is intentional.

`src/bot/**` is excluded from coverage; those are thin entrypoints that log in or call
Discord's REST API on import. Everything else is at 100%.

## Continuous integration

`.github/workflows/ci.yml` type-checks, builds, and runs the tests on every push and pull
request, against Node 24. It also runs dependency scanning (SCA) in a parallel job:
`npm audit` over the whole installed tree, plus `dependency-review-action` on pull requests
to review what the PR adds. Both fail the build at high severity or above.

`.github/workflows/codeql.yml` runs CodeQL (SAST) over the TypeScript and over the workflow
files themselves — on pushes to `main`, on every pull request, and weekly on a schedule so
newly published queries get applied to unchanged code. Findings appear under the
repository's Security → Code scanning tab. CodeQL is free on public repositories.

## License

MIT — see [LICENSE](LICENSE).
