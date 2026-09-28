import { describe, it, expect, vi } from 'vitest';
import { parseJson, validateIdentity, validateIntent, extractIdentity, classifyIntent } from '../src/claude.js';

const fakeClient = (text) => ({
  messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) },
});

describe('parseJson', () => {
  it('parses plain JSON', () => expect(parseJson('{"a":1}')).toEqual({ a: 1 }));
  it('strips code fences and extra text', () =>
    expect(parseJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it('returns null on junk', () => expect(parseJson('no json here')).toBeNull());
  it('returns null on broken JSON', () => expect(parseJson('{"a":')).toBeNull());
});

describe('validateIdentity', () => {
  it('accepts a complete identity', () =>
    expect(validateIdentity({ firstName: ' Ana ', lastName: 'Lopez', birthDate: '1980-03-05' }))
      .toEqual({ firstName: 'Ana', lastName: 'Lopez', birthDate: '1980-03-05' }));
  it('rejects missing fields', () =>
    expect(validateIdentity({ firstName: 'Ana', lastName: null, birthDate: '1980-03-05' })).toBeNull());
  it('rejects badly formatted dates', () =>
    expect(validateIdentity({ firstName: 'Ana', lastName: 'Lopez', birthDate: 'March 5' })).toBeNull());
});

describe('extractIdentity', () => {
  it('returns identity from a model reply', async () => {
    const client = fakeClient('{"firstName":"Ana","lastName":"Lopez","birthDate":"1980-03-05"}');
    await expect(extractIdentity('Ana Lopez March fifth 1980', client))
      .resolves.toEqual({ firstName: 'Ana', lastName: 'Lopez', birthDate: '1980-03-05' });
    expect(client.messages.create).toHaveBeenCalledOnce();
  });
  it('returns null when the model gives unusable output', async () => {
    await expect(extractIdentity('uh hi', fakeClient('I am not sure'))).resolves.toBeNull();
  });
});

describe('classifyIntent', () => {
  it('returns category and reply', async () => {
    const client = fakeClient('{"category":"refill","reply":"You need a refill."}');
    await expect(classifyIntent('refill please', client))
      .resolves.toEqual({ category: 'refill', reply: 'You need a refill.' });
  });
  it('maps unknown categories to other', () =>
    expect(validateIntent({ category: 'pizza', reply: 'x' }).category).toBe('other'));
});