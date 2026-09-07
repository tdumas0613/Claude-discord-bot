#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { BotStack } from '../lib/bot-stack';

/**
 * Entrypoint for `cdk synth` / `cdk deploy`.
 *
 * Configuration comes from CDK context, falling back to the environment, so a
 * deploy can be driven either by `cdk.json` / `-c name=value` or by the same
 * variables `.env` already uses locally.
 */

/**
 * Every environment deploys here.
 *
 * Deliberately not `CDK_DEFAULT_REGION`. That variable is whatever the CLI
 * resolved from ambient credentials, and when nothing configures a region it
 * quietly becomes us-east-1 — deploying a second, invisible copy of the bot
 * with its own Function URL that Discord knows nothing about. Failing to
 * notice costs more than being unable to override, so overriding is explicit:
 * `-c REGION=…` or `REGION=…`.
 */
const DEFAULT_REGION = 'us-east-2';

const app = new App();

function required(name: string): string {
  const value = (app.node.tryGetContext(name) as string | undefined) ?? process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Pass it with -c ${name}=... or set it in the environment.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return (app.node.tryGetContext(name) as string | undefined) ?? process.env[name] ?? fallback;
}

new BotStack(app, optional('STACK_NAME', 'ClaudeDiscordRoastBot'), {
  discordClientId: required('DISCORD_CLIENT_ID'),
  discordPublicKey: required('DISCORD_PUBLIC_KEY'),
  anthropicSecretName: optional('ANTHROPIC_SECRET_NAME', 'claude-discord-roast-bot/anthropic-api-key'),
  env: {
    // The account comes from whichever credentials are in use, and stays
    // undefined without them so `cdk synth` still works in CI. The region does
    // not get that treatment — see DEFAULT_REGION. A partially specified
    // environment is valid CDK.
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: optional('REGION', DEFAULT_REGION),
  },
  description: 'Discord /roast bot: HTTP interactions responder + roast worker',
});
