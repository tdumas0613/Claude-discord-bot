# Setup guide

How to create a private Discord bot, add it to your server, and run this project on your
own machine. Start to finish this takes about fifteen minutes.

"Private" here means the bot can only be added to servers by you, its owner. Anyone who
finds your application ID will not be able to invite it to their own server.

## Before you start

- **Node.js 24** (the current LTS). Check with `node -v`; the required version is recorded
  in `.nvmrc`.
- **A Discord account**, and **Manage Server** permission on the server you want to add the
  bot to. If it isn't your own server, you'll need an admin to add it for you.
- **An Anthropic API key** from [the Anthropic console](https://console.anthropic.com/settings/keys).
  Each `/roast` is a billed API call.

---

## Part 1 — Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and
   click **New Application**. Give it a name (this is what shows up in Discord) and accept
   the terms.

2. Open the **Bot** tab in the left sidebar.

3. **Make the bot private.** Scroll to **Authorization Flow** and turn **Public Bot**
   *off*. This is the step that makes it private — with it off, only you can invite the bot
   to a server. Click **Save Changes**.

4. **Copy the bot token.** Still on the Bot tab, click **Reset Token**, confirm, and copy
   the value it shows you. You will only see it once; if you lose it, reset it again.

   > This token is a password for your bot. Don't commit it, paste it into a chat, or share
   > a screenshot of it. If it leaks, click Reset Token to invalidate the old one.

5. **Copy the application ID.** Go to **General Information** and copy the **Application
   ID**. This is a long number.

   > Three different long values live in the portal: the Application ID, the Public Key,
   > and the Client Secret. You want the **Application ID**. The other two will not work.

6. **Leave privileged intents alone.** This bot only uses slash commands, so it does not
   need Message Content Intent, Server Members Intent, or Presence Intent. Leave them off.

## Part 2 — Invite the bot to your server

1. In the Developer Portal, go to **OAuth2** → **URL Generator**.

2. Under **Scopes**, tick **both**:
   - `bot`
   - `applications.commands`

   Both are required. With only `bot`, the bot joins your server but you will not be able
   to register `/roast`, and it will never appear in Discord's command menu.

3. Under **Bot Permissions**, tick **Send Messages**. That is enough for this bot — it only
   replies to slash commands.

4. Copy the **Generated URL** at the bottom of the page and open it in your browser.

5. Pick your server from the dropdown and click **Authorize**.

   > The dropdown only lists servers where you have Manage Server. If your server isn't
   > there, that's the reason.

The bot will now appear in your member list, offline. It stays offline until you start it
in Part 3 — that's expected.

## Part 3 — Run the bot locally

1. **Get the code and install dependencies.**

   ```bash
   git clone https://github.com/tdumas0613/Claude-discord-bot.git
   cd Claude-discord-bot
   npm install
   ```

2. **Create your `.env` file.**

   ```bash
   cp .env.example .env
   ```

   Open `.env` and fill in all four values:

   ```
   DISCORD_TOKEN=the bot token from Part 1, step 4
   ANTHROPIC_API_KEY=your Anthropic API key
   DISCORD_CLIENT_ID=the application ID from Part 1, step 5
   DISCORD_GUILD_ID=the ID of your server (see below)
   ```

   To get your server ID: in Discord, open **User Settings → Advanced** and turn on
   **Developer Mode**. Then right-click your server's icon and choose **Copy Server ID**.

   Notes on these values:
   - The first three are all **required**. The bot refuses to start without them, and so
     does the registration step — including `ANTHROPIC_API_KEY`, even though registration
     never talks to Anthropic.
   - `DISCORD_GUILD_ID` is optional but strongly recommended while setting up. With it, the
     command registers to that one server and appears **immediately**. Without it, the
     command registers globally and can take **up to an hour** to show up.
   - An empty value counts as missing. `DISCORD_CLIENT_ID=` with nothing after it will fail
     the same way as leaving the line out.
   - `.env` is git-ignored. Never commit it.

3. **Register the slash command.**

   ```bash
   npm run register
   ```

   This is the step that tells Discord the `/roast` command exists. **Adding the bot to
   your server in Part 2 did not do this** — they are separate operations, and skipping
   this one is the most common reason `/roast` never appears.

   A successful run looks like:

   ```
   Registering 1 command(s) as application 123456789012345678 → guild 987654321098765432
   Registered 1 command(s) to guild 987654321098765432.
   ```

   Check that the application ID and server ID it prints are the ones you expect. If
   registration fails, the script prints the HTTP status and the most likely cause — see
   [Troubleshooting](#troubleshooting).

   Re-run this only when the command definition itself changes. Editing the roast prompt or
   any other logic does not require re-registering.

4. **Start the bot.**

   ```bash
   npm start
   ```

   You should see:

   ```
   Logged in as YourBotName#1234
   ```

   The bot is now online. Leave this terminal running — closing it stops the bot. There is
   no hosting involved here: the bot runs on your machine, so it is only online while this
   process is.

## Part 4 — Try it

In any channel the bot can see, type `/` and pick **roast** from the popup menu, then
choose a user for the `user` field.

Do **not** type `/roast @someone` as plain text and press Enter — slash commands are picked
from the menu, not typed out. If you type it as text, it posts as an ordinary message.

After a few seconds the bot replies with a roast, mentioning the person.

---

## Part 5 — Deploy to AWS (optional)

Parts 1–4 keep a process running on your machine. This part moves the bot to Lambda, so
it runs only when someone uses it and there is nothing to keep alive.

You need the AWS CLI signed in (`aws login`) and an account that has been bootstrapped
for CDK — `cd infra && npm ci && npx cdk bootstrap aws://<account-id>/us-east-2`, once
per account and region. The install comes first because the CDK CLI is a dependency of
`infra/`, and without an active sign-in CDK fails with
`no credentials have been configured`.

**1. Put the Anthropic key in Secrets Manager.**

The deployed worker reads the key from there rather than from an environment variable, so
it never appears in a CloudFormation template or in the Lambda console.

```bash
aws secretsmanager create-secret \
  --name claude-discord-roast-bot/anthropic-api-key \
  --secret-string 'sk-ant-...'
```

**2. Install and deploy.**

`infra/` is a separate npm package, so it needs its own install.

```bash
npm ci --prefix infra
DISCORD_CLIENT_ID=... DISCORD_PUBLIC_KEY=... npm run deploy --prefix infra
```

Both values are on the Developer Portal's General Information page — the same ones from
Part 1. Neither is a secret.

If the deploy fails complaining about **minimum unreserved concurrency**, the account's
concurrent-execution limit is lower than the stack's reservations assume — new AWS
accounts often start well below the usual 1,000, and AWS requires at least 100 to stay
unreserved. Either lower `reservedConcurrentExecutions` in `infra/lib/bot-stack.ts` (20
for the responder, 10 for the worker) or request a limit increase in the Service Quotas
console.

**3. Point Discord at it.**

The deploy prints an `InteractionsEndpointUrl`. Paste it into Developer Portal → your app
→ General Information → **Interactions Endpoint URL**, and save.

Discord immediately sends a request with a deliberately invalid signature and refuses the
URL unless it is rejected. Saving successfully means signature verification works.

**4. Register the command, if you haven't.**

Slash commands are registered against the application, not the host, so if you already
ran `npm run register` in Part 3 there is nothing to do. Otherwise run it now.

Once the endpoint URL is set, Discord stops using the gateway connection for slash
commands — you do not need `npm start` running any more.

---

## Part 6 — Deploy from GitHub Actions (optional)

Part 5 deploys one stack from your laptop. This replaces that with a **Deployment
Pipeline** workflow that deploys two stacks — `dev` then `prod` — into **us-east-2**,
authenticating with short-lived OIDC credentials rather than stored AWS keys.

The pipeline is manual: run it from the Actions tab on whatever branch you like. It runs
the CI checks once, deploys dev, then waits for a human before prod.

Both stacks live in the same AWS account, told apart by stack name and secret path:

| | dev | prod |
|---|---|---|
| Stack | `ClaudeDiscordRoastBot-dev` | `ClaudeDiscordRoastBot-prod` |
| Secret | `claude-discord-roast-bot/dev/anthropic-api-key` | `…/prod/…` |

Both use the **same Discord application**, so only one of the two Function URLs can be
registered as the Interactions Endpoint — prod's. The dev stack is reached by sending it
signed requests directly, not through Discord.

### One-time AWS setup

**1. Sign in to AWS.** Every command in this section needs credentials, and a sign-in
expires — so do this first, and again whenever you come back to it:

```bash
aws login
aws sts get-caller-identity   # should print the account you are about to bootstrap
```

Skipping this is the usual cause of
`Need to perform AWS calls for account ..., but no credentials have been configured`.
That error means the credential chain found *nothing* — it is not a permissions problem,
and an expired sign-in looks exactly the same as never having signed in.

**2. Bootstrap CDK** for the account and region, if you have not already. Install
`infra/`'s dependencies first — the pinned CDK CLI lives in that package, so without the
install `npx` downloads a different version from the registry, and running from the
repository root does the same:

```bash
cd infra
npm ci
npx cdk bootstrap aws://<account-id>/us-east-2
cd ..
```

The `cd ..` matters: the steps below write temporary policy files into the current
directory, and they do not belong inside `infra/`.

**3. Register GitHub as an OIDC identity provider.** This is what lets a workflow prove
which repository it is running in, so no AWS keys need to exist in GitHub at all:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

**4. Create the deploy role.** The trust policy is scoped to the two environments rather
than to a branch — the pipeline runs from any branch, but only ever from these two
environments, and GitHub puts that in the token's `sub` claim:

```bash
cat > trust.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": [
          "repo:tdumas0613/Claude-discord-bot:environment:dev",
          "repo:tdumas0613/Claude-discord-bot:environment:prod"
        ]
      }
    }
  }]
}
JSON

aws iam create-role \
  --role-name GitHubActionsDeploy \
  --assume-role-policy-document file://trust.json
```

**5. Give it only what it needs.** Not `AdministratorAccess`: CDK's bootstrap already
created roles that hold the deploy permissions, so this role only needs to assume those,
plus Secrets Manager for the API key sync.

```bash
cat > policy.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::<account-id>:role/cdk-hnb659fds-*-<account-id>-us-east-2"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:DescribeSecret",
        "secretsmanager:CreateSecret",
        "secretsmanager:PutSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-2:<account-id>:secret:claude-discord-roast-bot/*"
    }
  ]
}
JSON

aws iam put-role-policy \
  --role-name GitHubActionsDeploy \
  --policy-name DeployBotStacks \
  --policy-document file://policy.json
```

Note the role ARN it prints — the next step needs it.

### One-time GitHub setup

Under **Settings → Secrets and variables → Actions**, add three *variables* (not
secrets — a client ID and a public key are public by design, and a role ARN is not
sensitive):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<account-id>:role/GitHubActionsDeploy` |
| `DISCORD_CLIENT_ID` | Application ID, from General Information |
| `DISCORD_PUBLIC_KEY` | Public Key, from General Information |

Under **Settings → Environments**, in each of `dev` and `prod`, add a secret named
`ANTHROPIC_API_KEY`. The pipeline copies each environment's value into that
environment's Secrets Manager secret before deploying.

Then, on the **`prod` environment only**, add yourself under **Required reviewers**.
**This is what makes prod wait for you.** Without it the pipeline still works, it simply
runs prod straight after dev with no pause.

### Running it

Actions → **Deployment Pipeline** → Run workflow, pick a branch, run.

Checks run once, dev deploys, and the run then stops at "Review deployments" until you
approve prod. Each deploy prints its stack outputs — including the interactions endpoint
URL — to the run summary.

Only prod's URL goes in the Developer Portal. The first prod deploy needs that pasted in
per Part 5, step 3; after that the URL is stable and redeploys do not change it.

---

## Troubleshooting

**`/roast` doesn't appear in the command menu.**
Almost always one of:
- `npm run register` was never run, or it failed. Run it again and read the output.
- The bot was invited without the `applications.commands` scope. Redo Part 2 with both
  scopes ticked — you can re-run the invite URL on a server the bot is already in.
- `DISCORD_GUILD_ID` points at a different server than the one you're typing in.
- You registered globally (no `DISCORD_GUILD_ID`) and it hasn't propagated yet. Wait, or
  set a guild ID and re-register.

**Registration fails with HTTP 401.**
`DISCORD_TOKEN` is wrong or was invalidated. Reset it (Part 1, step 4) and update `.env`.
Make sure you copied the bot token, not the Client Secret or Public Key.

**Registration fails with HTTP 403.**
The bot isn't in the server named by `DISCORD_GUILD_ID`, or it was invited without
`applications.commands`.

**Registration fails with HTTP 404.**
`DISCORD_CLIENT_ID` isn't a valid Application ID. Re-copy it from General Information.

**`Missing required environment variable ...`**
That variable is absent or empty in `.env`. Note that `npm run register` requires
`ANTHROPIC_API_KEY` too, even though it doesn't use it.

**Discord says "The application did not respond."**
Discord has the command, but nothing answered within three seconds. The bot process is
probably not running — check the terminal from Part 3, step 4.

**The bot replies "My Claude API key is not working."**
`ANTHROPIC_API_KEY` is wrong or has no credit. Check it in the Anthropic console.

**On AWS: the reply stays "thinking…" forever.**
The responder deferred but the worker never edited the reply. Two places to look, in
order: the worker's log group in CloudWatch, and the dead-letter queue the deploy prints
as `WorkerFailureQueueUrl`. Anything in that queue is an invocation that failed through
every automatic retry — the message carries the original event and the error. Nothing
polls it for you.

A worker that could not read the secret shows up as a "Something went wrong" reply
rather than a hang, so a genuine hang usually means the follow-up itself failed.

**On AWS: Discord won't save the Interactions Endpoint URL.**
The responder is not returning 401 for a bad signature. Check that `DISCORD_PUBLIC_KEY`
in the deploy matches the application's Public Key, and redeploy.

**On AWS: every interaction gets rejected, and the logs show nothing wrong.**
Requests are refused if their timestamp is more than five minutes from the function's
clock, which stops a captured request being replayed. Lambda's clock is managed by AWS,
so in practice this only fires on a genuine replay — but it is what to suspect if signed
requests are being rejected and the public key is definitely right.

**The pipeline fails at "Configure AWS credentials".**
The OIDC trust policy does not match. It is scoped to
`repo:<owner>/<repo>:environment:dev` and `:environment:prod`, so check the repository
name matches exactly, and that `AWS_DEPLOY_ROLE_ARN` points at the role you created.

**The pipeline deployed prod without asking.**
The `prod` environment has no required reviewer. Settings → Environments → prod →
Required reviewers.

**A deploy fails on minimum unreserved concurrency.**
Each stack reserves 30 concurrent executions, so both together reserve 60, and AWS
requires 100 to stay unreserved. On an account with a low limit, deploy only one
environment or raise the quota — see the note in Part 5.

**`/roast` works in prod but the dev stack seems dead.**
Expected. Both environments share one Discord application, and an application has exactly
one Interactions Endpoint URL, which points at prod. Reach dev by sending signed requests
to its own Function URL, printed in the pipeline's run summary.

**`Cannot find module ... /src/config.js`**
You ran a file in `src/` directly. Always use `npm start` and `npm run register`, which
compile to `dist/` first.
