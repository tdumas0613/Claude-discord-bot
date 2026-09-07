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

The command logic does not know how it was invoked. A *transport* turns whatever arrived
into a `CommandRequest` — resolving which display name to roast — and turns the returned
`CommandReply` back into something Discord understands. There are two:

- **Gateway** (`bot/`), for local development: holds a WebSocket, defers the reply, and
  edits it once the roast is ready. This is what `npm start` runs.
- **HTTP interactions** (`lambda/`), for AWS: Discord posts to a Function URL. Because
  the reply is due within three seconds and a roast takes longer, one function verifies
  the signature and acknowledges, and a second does the work and edits the reply
  afterwards using the interaction token.

```
src/
  bot/                          the Discord gateway transport (local development)
    index.ts                    entrypoint: creates the client, logs in
    gateway.ts                  discord.js interaction -> command -> reply
    register-slash-commands.ts  entrypoint: npm run register
  lambda/                       the HTTP-interactions transport (AWS)
    interaction.ts              raw Discord JSON -> command request
    events.ts                   the WorkerEvent contract between the two
    responder/                  invocation 1: answers within three seconds
      index.ts                  entrypoint: reads config, builds the handler
      handler.ts                verify signature, PONG, defer, hand off
      signature.ts              Ed25519 verification, no dependencies
      dispatch.ts               asynchronous invoke of the worker
    worker/                     invocation 2: does the slow part
      index.ts                  entrypoint
      handler.ts                run the command, edit the deferred reply
      discord-api.ts            the follow-up PATCH
      secrets.ts                the Anthropic key, from Secrets Manager
  commands/                     transport-agnostic command logic
    index.ts                    registry: name -> command
    names.ts                    just the names, for the responder
    types.ts                    CommandRequest / CommandReply / BotCommand
    roast/                      index · command · handler · generate · prompt
  config.ts                     environment variables
infra/                          the CDK app that deploys the two functions
  bin/app.ts                    reads config, instantiates the stack
  lib/bot-stack.ts              the functions, the URL, the permissions
```

Adding a second command is: a new folder under `commands/`, exporting a `BotCommand`
from its `index.ts`, plus one line in `commands/index.ts` and one in `commands/names.ts`.
A test fails if you forget the second.

Entrypoints act on import — logging in, calling Discord's REST API, reading AWS config —
which is why everything else lives outside them and can be imported by a test without
touching the network. Worth preserving.

The Anthropic SDK is imported in exactly one file, `commands/roast/generate.ts`. It
translates SDK exceptions into a `RoastUnavailableError` carrying a `reason`, so the
Discord-facing code never sees a vendor type.

Picking the name to roast is fiddlier than it looks, and each transport does it from a
different shape: the gateway from discord.js objects (which come as either a `GuildMember`
with a `displayName` getter or a raw resolved member carrying `nick`), Lambda from the raw
`resolved` JSON. Both apply the same precedence — nickname, global display name, username.

## Deploying to AWS

`infra/` is a CDK app — a separate npm package, so `aws-cdk-lib` never lands in the
bot's dependency tree or its Lambda bundles.

```bash
cd infra
npm install
npm test                    # asserts the stack's shape, no AWS account needed
npm run synth               # bundles both functions with esbuild
npm run deploy
```

Two functions come out of it, each bundled from its own entrypoint:

| | Responder | Worker |
|---|---|---|
| Entrypoint | `src/lambda/responder/index.ts` | `src/lambda/worker/index.ts` |
| Trigger | Function URL, unauthenticated | asynchronous invoke, from the responder |
| Timeout | 5s | 60s |
| Bundle | ~0.5 MB | ~1.9 MB |

The responder's bundle is the small one on purpose. It has to cold-start inside
Discord's three seconds, so it reads `commands/names.ts` — a list of names that imports
nothing — instead of the registry, which would drag in `discord.js` and the Anthropic
SDK behind it. That one import is worth about 1.5 MB.

That Function URL *is* the endpoint Discord posts to — an AWS-managed HTTPS address on
`*.lambda-url.<region>.on.aws`, which is all Discord asks for. There is no API Gateway,
load balancer, or custom domain in front of it, and adding one would only cost money and
add something else to debug.

It is unauthenticated because it has to be: Discord signs each request with the
application's Ed25519 key and cannot produce SigV4. `responder/signature.ts` is what
guards it, and Discord probes the endpoint with deliberately invalid signatures before it
will accept the URL. Verification also rejects anything whose timestamp is more than five
minutes off, so a captured request cannot be replayed indefinitely — every replay would
otherwise be a real model call on your bill.

Two more things keep an unattended deployment cheap and quiet:

- **Reserved concurrency** — 20 on the responder, 10 on the worker. Free, and it bounds
  what a flood of junk aimed at a public URL can cost. The worker's cap is the one that
  matters, since each of its invocations is a model call.
- **A dead-letter queue** on the worker, printed as `WorkerFailureQueueUrl`. If an
  invocation fails through every automatic retry, the event lands there instead of
  vanishing. Nothing polls it — it is where to look when a reply never arrives.

Running this costs nothing at hobby volume except Secrets Manager, which is about
$0.40/month. Lambda's free tier (1M requests and 400,000 GB-seconds monthly) does not
expire after a year, Function URLs carry no charge of their own, and the log groups and
queue sit inside their free allowances.

Before the first deploy, put the Anthropic key in Secrets Manager — CDK references the
secret rather than creating it, so the value never appears in a template or in
`cdk diff`:

```bash
aws secretsmanager create-secret \
  --name claude-discord-roast-bot/anthropic-api-key \
  --secret-string 'sk-ant-...'
```

Then deploy with the application's public identifiers, and paste the
`InteractionsEndpointUrl` output into Developer Portal → General Information →
Interactions Endpoint URL. Discord verifies the endpoint at that moment, so the stack
has to be deployed first.

```bash
DISCORD_CLIENT_ID=... DISCORD_PUBLIC_KEY=... npm run deploy --prefix infra
```

Neither of those is a secret — the client ID is public, and the public key exists to be
published — which is why they are plain environment variables and the API key is not.

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

A third job installs `infra/`, type-checks it, runs the stack's tests, and synthesizes
it. Synth is the part that matters: it runs esbuild over both Lambda entrypoints, so a
broken import fails CI rather than a deploy.

`.github/workflows/codeql.yml` runs CodeQL (SAST) over the TypeScript and over the workflow
files themselves — on pushes to `main`, on every pull request, and weekly on a schedule so
newly published queries get applied to unchanged code. Findings appear under the
repository's Security → Code scanning tab. CodeQL is free on public repositories.

## License

MIT — see [LICENSE](LICENSE).
