import 'dotenv/config';

/** Thrown when a required environment variable is absent or empty. */
export class MissingConfigError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Missing required environment variable ${variable}.`);
    this.name = 'MissingConfigError';
    this.variable = variable;
  }
}

/**
 * Reads a required environment variable.
 *
 * Throws rather than exiting: in Lambda, killing the process turns a fixable
 * configuration mistake into a container crash with no useful response. CLI
 * entrypoints wrap this in {@link failFast} to keep their old behaviour.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingConfigError(name);
  }
  return value;
}

/** Reads an optional environment variable, treating empty as absent. */
export function optionalEnv(name: string): string | null {
  return process.env[name] || null;
}

/**
 * For CLI entrypoints: turn a missing variable into a readable message and a
 * non-zero exit, instead of an unhandled rejection and a stack trace.
 */
export function failFast<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error(`${error.message} Copy .env.example to .env and fill it in.`);
      process.exit(1);
    }
    throw error;
  }
}
