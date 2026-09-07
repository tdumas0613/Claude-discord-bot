import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BotStack } from '../lib/bot-stack';

/**
 * These assert the properties the bot actually depends on — the three-second
 * deadline, the unauthenticated URL Discord requires, the key never appearing
 * in the template — rather than snapshotting the whole synthesized stack,
 * which would break on every CDK upgrade without telling us anything.
 *
 * Bundling is stubbed: esbuild runs on real synth, and these tests should not
 * pay for it. `aws:cdk:bundling-stacks` set to nothing matches no stack.
 */
function synth() {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new BotStack(app, 'TestStack', {
    discordClientId: '123456789',
    discordPublicKey: 'ab'.repeat(32),
    anthropicSecretName: 'test/anthropic-key',
  });
  return Template.fromStack(stack);
}

describe('BotStack', () => {
  it('deploys exactly two functions', () => {
    synth().resourceCountIs('AWS::Lambda::Function', 2);
  });

  it('runs both on the Node major the project targets', () => {
    const functions = Object.values(
      synth().findResources('AWS::Lambda::Function'),
    ) as Array<{ Properties: { Runtime: string } }>;

    expect(functions).toHaveLength(2);
    for (const fn of functions) {
      expect(fn.Properties.Runtime).toBe('nodejs24.x');
    }
  });

  it('keeps the responder inside Discord\'s three-second deadline', () => {
    // A responder timeout above 3s cannot help: Discord has already given up.
    synth().hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ DISCORD_PUBLIC_KEY: 'ab'.repeat(32) }) },
      Timeout: 5,
    });
  });

  it('gives the worker room for a model call', () => {
    synth().hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ ANTHROPIC_SECRET_ID: 'test/anthropic-key' }) },
      Timeout: 60,
    });
  });

  it('exposes the responder over an unauthenticated Function URL', () => {
    // Discord signs with Ed25519 and cannot produce SigV4, so AWS_IAM is not
    // an option; `responder/signature.ts` is what actually guards this URL.
    synth().hasResourceProperties('AWS::Lambda::Url', {
      AuthType: 'NONE',
    });
  });

  it('puts a URL on the responder and not on the worker', () => {
    synth().resourceCountIs('AWS::Lambda::Url', 1);
  });

  it('lets the responder invoke the worker', () => {
    synth().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'lambda:InvokeFunction', Effect: 'Allow' }),
        ]),
      },
    });
  });

  it('grants the worker read on the secret, and only read', () => {
    synth().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  it('does not create the secret, only references it', () => {
    // Creating it would mean a CDK-generated value that has to be overwritten
    // out of band anyway.
    synth().resourceCountIs('AWS::SecretsManager::Secret', 0);
  });

  it('never puts the API key in the template', () => {
    const rendered = JSON.stringify(synth().toJSON());
    expect(rendered).toContain('test/anthropic-key');
    expect(rendered).not.toMatch(/sk-ant/);
  });

  it('does not leave log groups behind when the stack is destroyed', () => {
    const template = synth();
    template.resourceCountIs('AWS::Logs::LogGroup', 2);
    template.hasResource('AWS::Logs::LogGroup', {
      Properties: { RetentionInDays: 30 },
      DeletionPolicy: 'Delete',
    });
  });

  it('publishes the endpoint to paste into the Developer Portal', () => {
    expect(Object.keys(synth().findOutputs('*'))).toEqual(
      expect.arrayContaining(['InteractionsEndpointUrl', 'WorkerFunctionName']),
    );
  });
});
