# Claude Discord Roast Bot

A small Discord bot with a single slash command, `/roast`, that asks the Claude API to
write a short, playful, PG-13 roast of another server member.

The model is given **only the target's Discord display name** — no message history, no
profile data, nothing else — and the system prompt keeps roasts away from race, religion,
disability, gender, sexual orientation, appearance, and other protected traits.

## Requirements

- Node.js 20 or newer
- A Discord application with a bot user
- An Anthropic API key

## Setup

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
   npm run deploy
   ```

   With `DISCORD_GUILD_ID` set, the command registers to that server and is available
   immediately. Without it, the command registers globally and can take up to an hour to
   appear.

6. **Start the bot**

   ```bash
   npm start
   ```

## Usage

```
/roast user:@someone
```

The bot defers the reply while Claude writes, then posts the roast mentioning the target.

## How it works

| File                    | Role                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `src/index.ts`          | Creates the client, wires up events, logs in                   |
| `src/interaction.ts`    | Handles the `/roast` interaction and formats replies           |
| `src/roast.ts`          | System prompt and the Claude API call                          |
| `src/commands.ts`       | Slash command definition, shared with the deploy script        |
| `src/deploy-commands.ts`| Registers the command with Discord                             |
| `src/config.ts`         | Loads and validates environment variables                      |

The API call uses `claude-opus-5` at low effort (a one-liner needs no deep reasoning) and
enables server-side refusal fallbacks, so a request the model declines is automatically
retried on a fallback model inside the same call. If the whole chain still declines, the
bot posts a harmless "consider yourself spared" message rather than an error.

## Tests

```bash
npm test              # run the suite once
npm run test:watch    # re-run on change
npm run test:coverage # run with a coverage report
```

The suite is [Jest](https://jestjs.io/) with [ts-jest](https://kulshekhar.github.io/ts-jest/),
running against native ES modules — which is why the scripts invoke Jest through
`node --experimental-vm-modules` rather than the `jest` binary directly. Tests live in
`tests/` and cover the command definition, the shape of the Claude request (model, effort,
fallbacks, prompt guardrails, display-name handling), the interaction handler's reply and
failure paths, and config validation. No test makes a network call: the Anthropic SDK and
Discord interaction are stubbed.

`src/index.ts` and `src/deploy-commands.ts` are excluded from coverage — they are thin
wiring that logs in or calls Discord's REST API on import.

## TypeScript

The project is written in TypeScript under `strict` mode and compiled with `tsc`:

```bash
npm run typecheck   # tsc over src/ and tests/, no output
npm run build       # compile src/ to dist/
```

`npm start` and `npm run deploy` build first (via `prestart` / `predeploy`) and then run the
compiled output from `dist/`, so a fresh clone works without a separate build step.

Two config files: `tsconfig.json` type-checks everything including tests, and
`tsconfig.build.json` extends it to emit `src/` into `dist/`. Module resolution is
`NodeNext`, so relative imports carry the `.js` suffix in the TypeScript source — that is
correct for native ESM, and Jest maps it back to the `.ts` file on disk.

TypeScript is pinned to 6.x because ts-jest currently declares `typescript >=4.3 <7`.

## Continuous integration

`.github/workflows/ci.yml` type-checks, builds, and runs the tests on every push and pull
request, against Node 22.

## Safety notes

- Roasts are generated from the display name alone; the prompt forbids inventing
  biographical claims about real people.
- The prompt bans jokes about protected traits, slurs, sexual content, violence, and
  real-world tragedy, and instructs the model to ignore display names crafted to bait it.
- Guardrails in a prompt are strong but not absolute. For a public server, consider
  restricting who can run `/roast` with Discord's per-command permissions, and give people
  an easy way to report output they are unhappy with.

## License

MIT — see [LICENSE](LICENSE).
