import { normalize } from './urgent.js';

export function parseYesNo(text) {
  const t = normalize(text);
  if (/\b(no|nope|not|wrong|incorrect)\b/.test(t)) return 'no';
  if (/\b(yes|yeah|yep|yup|correct|right|sure|thats it|exactly)\b/.test(t)) return 'yes';
  return 'unclear';
}