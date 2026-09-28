import { describe, it, expect } from 'vitest';
import { parseYesNo } from '../src/yesno.js';

describe('parseYesNo', () => {
  it.each(['yes', 'Yeah, that is right', 'correct', "yep that's it"])
    ('"%s" is yes', (t) => expect(parseYesNo(t)).toBe('yes'));
  it.each(['no', "that's not right", 'nope', 'wrong'])
    ('"%s" is no', (t) => expect(parseYesNo(t)).toBe('no'));
  it.each(['um', '', undefined])
    ('"%s" is unclear', (t) => expect(parseYesNo(t)).toBe('unclear'));
});