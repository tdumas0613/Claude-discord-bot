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
  // Resolved from the ambient CLI credentials at deploy time. Left undefined
  // when unset so `cdk synth` works in CI without an AWS account.
  env:
    process.env['CDK_DEFAULT_ACCOUNT'] && process.env['CDK_DEFAULT_REGION']
      ? {
          account: process.env['CDK_DEFAULT_ACCOUNT'],
          region: process.env['CDK_DEFAULT_REGION'],
        }
      : undefined,
  description: 'Discord /roast bot: HTTP interactions responder + roast worker',
});
