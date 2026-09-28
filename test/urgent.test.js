import { describe, it, expect } from 'vitest';
import { isUrgent } from '../src/urgent.js';

describe('isUrgent', () => {
  it.each([
    'I have chest pain',
    "I can't breathe",
    'I cant breathe well',
    'my son is bleeding a lot',
    "I'm having trouble breathing",
    'I think she passed out',
    'I took too many pills, I think I overdosed',
    'This is an emergency',
  ])('flags "%s"', (text) => expect(isUrgent(text)).toBe(true));

  it.each([
    'I need a refill on my lisinopril',
    'Can I reschedule my appointment to Friday',
    'I have a question about my bill',
    '',
    undefined,
  ])('does not flag "%s"', (text) => expect(isUrgent(text)).toBe(false));
});