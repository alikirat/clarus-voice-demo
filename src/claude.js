import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const IDENTITY_PROMPT = `You extract caller identity from a phone speech transcript for a medical clinic.
Return ONLY a JSON object, no other text:
{"firstName": string|null, "lastName": string|null, "birthDate": "YYYY-MM-DD"|null}
Rules:
- Convert spoken dates ("April twelfth nineteen eighty five") to YYYY-MM-DD.
- If a field is missing or unclear, use null. Never guess.
- Capitalize names normally.`;

async function ask(system, userText) {
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL,
    max_tokens: 200,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: userText }],
  });
  return res.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export function parseJson(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function validateIdentity(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const { firstName, lastName, birthDate } = obj;
  const isName = (n) => typeof n === 'string' && n.trim().length > 0;
  const isDate = (d) =>
    typeof d === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    !Number.isNaN(Date.parse(d));
  if (!isName(firstName) || !isName(lastName) || !isDate(birthDate)) return null;
  return { firstName: firstName.trim(), lastName: lastName.trim(), birthDate };
}

export async function extractIdentity(transcript) {
  const text = await ask(IDENTITY_PROMPT, transcript);
  return validateIdentity(parseJson(text));
}