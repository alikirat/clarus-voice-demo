const TTL_MS = 30 * 60 * 1000;
const calls = new Map();

export function getCall(callSid) {
  if (!calls.has(callSid)) {
    calls.set(callSid, { verifyAttempts: 0, intentAttempts: 0, createdAt: Date.now() });
  }
  return calls.get(callSid);
}

export function endCall(callSid) {
  calls.delete(callSid);
}

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [sid, call] of calls) {
    if (now - call.createdAt > TTL_MS) calls.delete(sid);
  }
}, 60 * 1000);
sweeper.unref();