# Discord Roast Bot — Bruno collection

Exercises the deployed **responder** Lambda directly, without Discord in the
loop. Open the `bruno/discord-roast-bot` folder as a collection in
[Bruno](https://www.usebruno.com/), pick the **dev** environment, and run.

## You cannot sign as Discord

Discord signs interactions with the private half of the keypair whose public
half appears in the Developer Portal. **You only ever have the public half**, so
there is no way to produce a signature the responder will accept for the real
application.

The way around this is to deploy dev with a public key you own:

1. Generate a keypair:

   ```bash
   node -e "
   const { generateKeyPairSync } = require('node:crypto');
   const { publicKey, privateKey } = generateKeyPairSync('ed25519');
   const hex = (k, f) => Buffer.from(k.export({ format: 'jwk' })[f], 'base64url').toString('hex');
   console.log('testPublicKeyHex ', hex(publicKey, 'x'));
   console.log('testPrivateKeyHex', hex(privateKey, 'd'));
   "
   ```

2. In GitHub → Settings → Environments → **dev**, add an environment variable
   `DISCORD_PUBLIC_KEY` set to `testPublicKeyHex`. An environment variable
   overrides the repository-level one, so **dev** starts trusting your test key
   while **prod** keeps trusting Discord's.

3. Re-run the Deployment Pipeline so dev picks it up.

4. Put both values in this collection's dev environment —
   `testPrivateKeyHex` is marked secret, so Bruno keeps it out of the file and
   out of git.

Do this for dev only. Pointing prod at a key you hold would mean Discord's own
interactions no longer verify, and the bot would stop working.

## Environment variables

| Variable | What it is |
|---|---|
| `baseUrl` | The dev stack's Function URL. The pipeline prints it as `InteractionsEndpointUrl`; it is left as a placeholder here rather than committed, since this repository is public and the URL is an unauthenticated endpoint. |
| `testPrivateKeyHex` | **Secret.** The 32-byte Ed25519 seed, hex. Signs every request. |
| `testPublicKeyHex` | Its public half — the value dev must be deployed with. Kept here only so the pair stays together. |
| `applicationId` | Any Discord application ID. Only echoed back in the worker event. |
| `targetUserId` | The snowflake being roasted. Any 17–19 digit number. |
| `targetDisplayName` | The name the model actually sees. |

## Requests

| | Expects | Needs a key? |
|---|---|---|
| 01 — Verification handshake (PING) | 200, `{"type":1}` | yes |
| 02 — Roast command | 200, `{"type":5}` | yes |
| 03 — Rejects an invalid signature | 401 | no |
| 04 — Rejects a stale timestamp | 401 | yes |

Start with **03**. It needs no setup and proves the endpoint is reachable and
guarded — which is also exactly the probe Discord runs before it will accept an
Interactions Endpoint URL.

## How the signing works

`collection.bru` has a pre-request script that runs before every request. It
serializes the body and writes it straight back, so the bytes it signs are the
bytes that go out — verification is over the **raw** body, and anything that
re-serializes it in between turns every request into a 401 that looks like a key
problem. It then signs `timestamp + rawBody` with Ed25519 and sets both headers.

Bruno must be in **Developer Mode** for the collection (Collection settings →
Script), because the script uses Node's `crypto`. Safe mode blocks it.

## What 02 does not prove

A type-5 response means the responder verified, routed and handed off. The
worker then runs and fails, which is expected: `bruno-test-token` is not a real
interaction token, so Discord rejects the follow-up. Look in the worker's
CloudWatch log group, or the dead-letter queue printed as
`WorkerFailureQueueUrl`. Only a real interaction produces a reply in a channel.
