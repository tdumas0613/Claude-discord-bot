import { describe, expect, it } from '@jest/globals';
import { ApplicationCommandOptionType, ApplicationCommandType } from 'discord.js';
import type { APIApplicationCommandUserOption } from 'discord.js';
import { commands, roastCommand } from '../src/commands.js';

describe('/roast command definition', () => {
  const [roast] = commands;

  if (!roast) {
    throw new Error('expected a command to be defined');
  }

  it('exposes exactly one command', () => {
    expect(commands).toHaveLength(1);
  });

  it('is a chat input command named "roast"', () => {
    expect(roast.name).toBe('roast');
    expect(roast.type ?? ApplicationCommandType.ChatInput).toBe(
      ApplicationCommandType.ChatInput,
    );
  });

  it('has a description, which Discord requires', () => {
    expect(roast.description).toEqual(expect.any(String));
    expect(roast.description.length).toBeGreaterThan(0);
    expect(roast.description.length).toBeLessThanOrEqual(100);
  });

  it('takes a single required user option named "user"', () => {
    const options = roast.options ?? [];
    expect(options).toHaveLength(1);

    const [option] = options;
    expect(option?.type).toBe(ApplicationCommandOptionType.User);

    // Narrow to the user-option shape so `required` is actually type-checked.
    const userOption = option as APIApplicationCommandUserOption;
    expect(userOption.name).toBe('user');
    expect(userOption.required).toBe(true);
    expect(userOption.description.length).toBeGreaterThan(0);
  });

  it('serializes to the same payload the builder produces', () => {
    expect(roast).toEqual(roastCommand.toJSON());
  });
});
