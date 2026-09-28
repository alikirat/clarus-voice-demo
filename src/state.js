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