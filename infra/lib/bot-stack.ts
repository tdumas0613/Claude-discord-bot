import * as path from 'node:path';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

/** Repository root, from `infra/lib/` — where the Lambda sources live. */
const REPO_ROOT = path.join(__dirname, '..', '..');

export interface BotStackProps extends StackProps {
  /** Discord application ID. Public; addresses the follow-up webhook. */
  readonly discordClientId: string;
  /**
   * Discord application public key, hex. Public by design — it verifies that
   * an interaction really came from Discord.
   */
  readonly discordPublicKey: string;
  /**
   * Name of an existing Secrets Manager secret holding the Anthropic API key,
   * either as a bare string or as `{"ANTHROPIC_API_KEY":"..."}`.
   *
   * Referenced rather than created: a secret CDK creates would have its value
   * set out of band anyway, and referencing keeps the key out of the template
   * and out of `cdk diff` output.
   */
  readonly anthropicSecretName: string;
}

/**
 * The two functions behind `/roast`.
 *
 * Discord closes an interaction that is not answered within three seconds, and
 * a roast takes longer than that, so the work is split: the responder verifies
 * the request and acknowledges, then invokes the worker asynchronously, and the
 * worker edits the real reply in afterwards using the interaction token.
 */
export class BotStack extends Stack {
  /** The URL to paste into the Developer Portal's Interactions Endpoint field. */
  readonly interactionsEndpoint: string;

  constructor(scope: Construct, id: string, props: BotStackProps) {
    super(scope, id, props);

    const anthropicSecret = Secret.fromSecretNameV2(
      this,
      'AnthropicApiKey',
      props.anthropicSecretName,
    );

    const worker = new NodejsFunction(this, 'Worker', {
      ...sharedFunctionProps('worker'),
      // Generous because the ceiling costs nothing — Lambda bills the
      // milliseconds actually used, and a model call is the slow part.
      timeout: Duration.seconds(60),
      environment: {
        ANTHROPIC_SECRET_ID: anthropicSecret.secretName,
      },
      logGroup: new LogGroup(this, 'WorkerLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    anthropicSecret.grantRead(worker);

    const responder = new NodejsFunction(this, 'Responder', {
      ...sharedFunctionProps('responder'),
      // Deliberately tight. Everything here is signature verification and one
      // asynchronous invoke; anything slower has already missed Discord's
      // deadline, and a timeout says so in the logs instead of hiding it.
      timeout: Duration.seconds(5),
      environment: {
        DISCORD_PUBLIC_KEY: props.discordPublicKey,
        DISCORD_CLIENT_ID: props.discordClientId,
        WORKER_FUNCTION_NAME: worker.functionName,
      },
      logGroup: new LogGroup(this, 'ResponderLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    worker.grantInvoke(responder);

    // Unauthenticated on purpose: Discord signs each request with the
    // application's Ed25519 key and `responder/signature.ts` verifies it. IAM
    // auth is not an option — Discord cannot sign SigV4.
    const url = responder.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });
    this.interactionsEndpoint = url.url;

    new CfnOutput(this, 'InteractionsEndpointUrl', {
      value: url.url,
      description: 'Discord Developer Portal > General Information > Interactions Endpoint URL',
    });

    new CfnOutput(this, 'WorkerFunctionName', {
      value: worker.functionName,
      description: 'The function the responder invokes; useful for tailing logs',
    });
  }
}

/**
 * What both functions share: where their source is, and how it is bundled.
 *
 * The entrypoints live in the bot package, not in `infra/`, so `projectRoot`
 * and `depsLockFilePath` point back at the repository root — that is the tree
 * esbuild resolves `@anthropic-ai/sdk` and friends from.
 *
 * `externalModules: []` bundles the AWS SDK rather than trusting whatever
 * version the runtime ships. It costs a little bundle size and buys a
 * deployment that behaves the same on the day the runtime is updated.
 *
 * Each function gets only what its own entrypoint reaches, which is the point
 * of bundling per entry: the responder ships without the Anthropic SDK, and
 * the worker without the Lambda invoke client.
 *
 * More memory than either needs for the heap — it buys proportionally more
 * CPU, which is what shortens the responder's cold start, and the cold start
 * is what has to fit inside Discord's three seconds.
 */
function sharedFunctionProps(lambdaDir: 'responder' | 'worker') {
  return {
    entry: path.join(REPO_ROOT, 'src', 'lambda', lambdaDir, 'index.ts'),
    handler: 'handler',
    runtime: Runtime.NODEJS_24_X,
    projectRoot: REPO_ROOT,
    depsLockFilePath: path.join(REPO_ROOT, 'package-lock.json'),
    memorySize: 512,
    bundling: {
      format: OutputFormat.CJS,
      target: 'node24',
      minify: true,
      sourceMap: true,
      externalModules: [],
    },
  };
}
