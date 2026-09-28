const ALLOWED = new Set(['callSid', 'stage', 'category', 'outcome', 'ms', 'error', 'status']);

export function log(event) {
  const safe = {};
  for (const [key, value] of Object.entries(event)) {
    if (ALLOWED.has(key)) safe[key] = value;
  }
  console.log(JSON.stringify({ t: new Date().toISOString(), ...safe }));
}