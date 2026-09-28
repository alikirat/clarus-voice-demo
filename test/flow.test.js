import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import twilio from 'twilio';
import { createApp } from '../src/app.js';

process.env.VALIDATE_TWILIO_SIGNATURE = 'false';
process.env.TRANSFER_NUMBER = '+15555550123';
process.env.PUBLIC_BASE_URL = 'https://demo.ngrok.app';

const identity = { firstName: 'Ana', lastName: 'Lopez', birthDate: '1980-03-05' };

function makeApp(overrides = {}) {
  return createApp({
    extractIdentity: vi.fn().mockResolvedValue(identity),
    findPatient: vi.fn().mockResolvedValue({ id: '123' }),
    classifyIntent: vi.fn().mockResolvedValue({ category: 'refill', reply: 'You need a refill.' }),
    ...overrides,
  });
}

const post = (app, path, body) => request(app).post(path).type('form').send(body);

describe('call flow', () => {
  it('greets and gathers speech', async () => {
    const res = await post(makeApp(), '/voice', { CallSid: 'CA1' });
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<Gather');
    expect(res.text).toContain('/verify"');
  });

  it('routine call: verify, classify, confirm, hang up', async () => {
    const app = makeApp();
    let res = await post(app, '/verify', { CallSid: 'CA2', SpeechResult: 'Ana Lopez March 5 1980' });
    expect(res.text).toContain('/intent"');
    res = await post(app, '/intent', { CallSid: 'CA2', SpeechResult: 'I need a refill' });
    expect(res.text).toContain('You need a refill. Is that right?');
    res = await post(app, '/confirm', { CallSid: 'CA2', SpeechResult: 'yes' });
    expect(res.text).toContain('<Hangup/>');
    expect(res.text).not.toContain('<Dial');
  });

  it('urgent keywords transfer without calling Claude', async () => {
    const classifyIntent = vi.fn();
    const app = makeApp({ classifyIntent });
    await post(app, '/verify', { CallSid: 'CA3', SpeechResult: 'Ana Lopez March 5 1980' });
    const res = await post(app, '/intent', { CallSid: 'CA3', SpeechResult: 'I have chest pain' });
    expect(res.text).toContain('<Dial');
    expect(classifyIntent).not.toHaveBeenCalled();
  });

  it('model-detected urgent also transfers', async () => {
    const app = makeApp({ classifyIntent: vi.fn().mockResolvedValue({ category: 'urgent', reply: 'x' }) });
    await post(app, '/verify', { CallSid: 'CA4', SpeechResult: 'Ana Lopez March 5 1980' });
    const res = await post(app, '/intent', { CallSid: 'CA4', SpeechResult: 'my fever keeps getting worse' });
    expect(res.text).toContain('<Dial');
  });

  it('no match: one retry, then transfer', async () => {
    const app = makeApp({ findPatient: vi.fn().mockResolvedValue(null) });
    let res = await post(app, '/verify', { CallSid: 'CA5', SpeechResult: 'Bob Smith' });
    expect(res.text).toContain('/verify"');
    res = await post(app, '/verify', { CallSid: 'CA5', SpeechResult: 'Bob Smith' });
    expect(res.text).toContain('<Dial');
  });

  it('FHIR outage transfers to a person', async () => {
    const app = makeApp({ findPatient: vi.fn().mockRejectedValue(new Error('timeout')) });
    const res = await post(app, '/verify', { CallSid: 'CA6', SpeechResult: 'Ana Lopez' });
    expect(res.text).toContain('<Dial');
  });

  it('Claude failure during triage transfers to a person', async () => {
    const app = makeApp({ classifyIntent: vi.fn().mockRejectedValue(new Error('500')) });
    await post(app, '/verify', { CallSid: 'CA7', SpeechResult: 'Ana Lopez March 5 1980' });
    const res = await post(app, '/intent', { CallSid: 'CA7', SpeechResult: 'refill' });
    expect(res.text).toContain('<Dial');
  });

  it('unverified callers cannot skip to /intent', async () => {
    const res = await post(makeApp(), '/intent', { CallSid: 'CA8', SpeechResult: 'refill' });
    expect(res.text).toContain('<Redirect');
  });

  it('enforces Twilio signatures when validation is on', async () => {
    process.env.VALIDATE_TWILIO_SIGNATURE = 'true';
    process.env.TWILIO_AUTH_TOKEN = 'test_token';
    try {
      const app = makeApp();
      const host = 'demo.ngrok.app';
      const body = { CallSid: 'CA9' };

      const missing = await post(app, '/voice', body).set('Host', host);
      expect(missing.status).toBe(400);

      const forged = await post(app, '/voice', body).set('Host', host).set('X-Twilio-Signature', 'forged');
      expect(forged.status).toBe(403);

      const sig = twilio.getExpectedTwilioSignature('test_token', `https://${host}/voice`, body);
      const signed = await post(app, '/voice', body).set('Host', host).set('X-Twilio-Signature', sig);
      expect(signed.status).toBe(200);
    } finally {
      process.env.VALIDATE_TWILIO_SIGNATURE = 'false';
    }
  });
});