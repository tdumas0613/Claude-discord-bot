import { describe, expect, it } from '@jest/globals';
import {
  parseInteraction,
  resolveDisplayName,
  toCommandRequest,
  type RawInteraction,
} from '../../src/lambda/interaction.js';

/** A `/roast @someone` payload, shaped as Discord actually sends it. */
function roastPayload({
  nick = 'ServerNick',
  globalName = 'GlobalName',
  username = 'username',
}: Partial<{ nick: string | null; globalName: string | null; username: string }> = {}): RawInteraction {
  return {
    type: 2,
    token: 'interaction-token',
    application_id: 'app-1',
    data: {
      name: 'roast',
      options: [{ name: 'user', type: 6, value: '42' }],
      resolved: {
        users: { '42': { id: '42', username, global_name: globalName } },
        members: { '42': { nick } },
      },
    },
  };
}

describe('parseInteraction', () => {
  it('parses a well-formed payload', () => {
    expect(parseInteraction(JSON.stringify({ type: 1 }))?.type).toBe(1);
  });

  it.each([
    ['invalid JSON', 'not json at all'],
    ['an empty body', ''],
    ['JSON without a type', JSON.stringify({ data: {} })],
    ['a JSON array', JSON.stringify([1, 2])],
    ['JSON null', 'null'],
  ])('returns null for %s', (_label, body) => {
    expect(parseInteraction(body)).toBeNull();
  });
});

describe('resolveDisplayName', () => {
  it('prefers the per-server nickname', () => {
    expect(resolveDisplayName(roastPayload(), '42')).toBe('ServerNick');
  });

  it('falls back to the global display name when there is no nickname', () => {
    expect(resolveDisplayName(roastPayload({ nick: null }), '42')).toBe('GlobalName');
  });

  it('falls back to the username when there is neither', () => {
    expect(resolveDisplayName(roastPayload({ nick: null, globalName: null }), '42')).toBe('username');
  });

  it('falls back to the id rather than returning nothing', () => {
    expect(resolveDisplayName({ type: 2 }, '42')).toBe('42');
  });
});

describe('toCommandRequest', () => {
  it('exposes the command name', () => {
    expect(toCommandRequest(roastPayload()).commandName).toBe('roast');
  });

  it('resolves the user option to an id and display name', () => {
    expect(toCommandRequest(roastPayload()).getUser('user')).toEqual({
      id: '42',
      displayName: 'ServerNick',
    });
  });

  it('returns null for an option that was not supplied', () => {
    expect(toCommandRequest(roastPayload()).getUser('victim')).toBeNull();
  });

  it('ignores an option of the wrong type', () => {
    const payload: RawInteraction = {
      type: 2,
      data: { name: 'roast', options: [{ name: 'user', type: 3, value: 'just a string' }] },
    };

    expect(toCommandRequest(payload).getUser('user')).toBeNull();
  });

  it('produces an empty command name for a payload with no data', () => {
    expect(toCommandRequest({ type: 2 }).commandName).toBe('');
  });
});
