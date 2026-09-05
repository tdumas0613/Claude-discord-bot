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

**`Cannot find module ... /src/config.js`**
You ran a file in `src/` directly. Always use `npm start` and `npm run register`, which
compile to `dist/` first.
