const URGENT_PATTERNS = [
  /\bchest (pain|pains|pressure|tightness)\b/,
  /\b(cant|cannot|can not|couldnt|unable to) breathe?\b/,
  /\b(trouble|difficulty|hard time) breathing\b/,
  /\bshort(ness)? of breath\b/,
  /\bbleeding\b/,
  /\b(unconscious|unresponsive|passed out|fainted)\b/,
  /\bstroke\b/,
  /\bseizure\b/,
  /\boverdose(d)?\b/,
  /\ballergic reaction\b/,
  /\b(suicidal|kill myself|end my life|hurt myself)\b/,
  /\bemergency\b/,
];

export function normalize(text = '') {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUrgent(text) {
  const t = normalize(text);
  if (!t) return false;
  return URGENT_PATTERNS.some((re) => re.test(t));
}