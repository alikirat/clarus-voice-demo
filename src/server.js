import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';
import { extractIdentity, classifyIntent } from './claude.js';
import { isUrgent } from './urgent.js';
import { findPatient } from './fhir.js';
import { getCall, endCall } from './state.js';
import { parseYesNo } from './yesno.js';
import { log } from './log.js';

const { VoiceResponse } = twilio.twiml;
const VOICE = 'Polly.Joanna';
const MAX_VERIFY_ATTEMPTS = 2;
const MAX_INTENT_ATTEMPTS = 2;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

const fromTwilio = twilio.webhook({
  validate: process.env.VALIDATE_TWILIO_SIGNATURE !== 'false',
  protocol: 'https',
});

const url = (path) => `${process.env.PUBLIC_BASE_URL}${path}`;
const send = (res, vr) => res.type('text/xml').send(vr.toString());

function listen(vr, action, prompt) {
  const gather = vr.gather({
    input: 'speech',
    action: url(action),
    method: 'POST',
    speechModel: 'phone_call',
    enhanced: true,
    actionOnEmptyResult: true,
  });
  gather.say({ voice: VOICE }, prompt);
  return vr;
}

function transfer(vr, callSid, message, reason = 'transfer') {
  log({ callSid, stage: 'transfer', outcome: reason });
  vr.say({ voice: VOICE }, message);
  const number = process.env.TRANSFER_NUMBER;
  if (number) {
    vr.dial({ timeout: 25 }, number);
    vr.say({ voice: VOICE }, 'Sorry, no one was available. If this is an emergency, dial 9 1 1. Goodbye.');
  } else {
    vr.say({ voice: VOICE }, 'Our staff will call you back shortly. Goodbye.');
  }
  vr.hangup();
  endCall(callSid);
  return vr;
}

function urgentTransfer(vr, callSid, reason) {
  return transfer(
    vr,
    callSid,
    "If this is a life threatening emergency, please hang up and dial 9 1 1. I'm connecting you to our on-call team now.",
    reason
  );
}

app.post('/voice', fromTwilio, (req, res) => {
  const { CallSid } = req.body;
  getCall(CallSid);
  log({ callSid: CallSid, stage: 'greeting' });
  const vr = new VoiceResponse();
  listen(
    vr,
    '/verify',
    'Hello, and thank you for calling Sunrise Family Clinic. ' +
      'Please say your first and last name, and your date of birth.'
  );
  send(res, vr);
});

app.post('/verify', fromTwilio, async (req, res) => {
  const { CallSid } = req.body;
  const speech = req.body.SpeechResult || '';
  const call = getCall(CallSid);
  const vr = new VoiceResponse();
  const started = Date.now();

  if (isUrgent(speech)) return send(res, urgentTransfer(vr, CallSid, 'urgent_keyword_at_verify'));

  const retryOrTransfer = (outcome, retryPrompt) => {
    call.verifyAttempts += 1;
    log({ callSid: CallSid, stage: 'verify', outcome, ms: Date.now() - started });
    if (call.verifyAttempts < MAX_VERIFY_ATTEMPTS) {
      return send(res, listen(vr, '/verify', retryPrompt));
    }
    return send(
      res,
      transfer(vr, CallSid, "I wasn't able to find your record. Let me connect you with a staff member.", 'verify_failed')
    );
  };

  if (!speech.trim()) {
    return retryOrTransfer('no_speech', "Sorry, I didn't hear anything. Please say your first and last name, and your date of birth.");
  }

  let identity;
  try {
    identity = await extractIdentity(speech);
  } catch (err) {
    log({ callSid: CallSid, stage: 'verify', error: 'claude_error' });
    return send(res, transfer(vr, CallSid, 'Let me connect you with a staff member.', 'claude_error'));
  }

  if (!identity) {
    return retryOrTransfer(
      'incomplete_identity',
      "Sorry, I didn't catch all of that. Please say your first name, last name, and date of birth, including the year."
    );
  }

  let patient;
  try {
    patient = await findPatient(identity);
  } catch (err) {
    log({ callSid: CallSid, stage: 'verify', error: 'fhir_error' });
    return send(
      res,
      transfer(vr, CallSid, "I'm having trouble looking up your record. Let me connect you with a staff member.", 'fhir_error')
    );
  }

  if (!patient) {
    return retryOrTransfer(
      'no_match',
      "I couldn't find a match. Let's try once more. Please say your first and last name, and your date of birth."
    );
  }

  call.verified = true;
  call.patientId = patient.id;
  log({ callSid: CallSid, stage: 'verify', outcome: 'verified', ms: Date.now() - started });
  send(res, listen(vr, '/intent', 'Thank you, I found your record. How can I help you today?'));
});

app.post('/intent', fromTwilio, async (req, res) => {
  const { CallSid } = req.body;
  const speech = req.body.SpeechResult || '';
  const call = getCall(CallSid);
  const vr = new VoiceResponse();
  const started = Date.now();

  if (!call.verified) {
    log({ callSid: CallSid, stage: 'intent', outcome: 'unverified_redirect' });
    vr.redirect({ method: 'POST' }, url('/voice'));
    return send(res, vr);
  }

  if (isUrgent(speech)) return send(res, urgentTransfer(vr, CallSid, 'urgent_keyword'));

  if (!speech.trim()) {
    call.intentAttempts += 1;
    if (call.intentAttempts < MAX_INTENT_ATTEMPTS) {
      return send(res, listen(vr, '/intent', "Sorry, I didn't hear anything. How can I help you today?"));
    }
    return send(res, transfer(vr, CallSid, 'Let me connect you with a staff member.', 'no_speech'));
  }

  let intent = null;
  try {
    intent = await classifyIntent(speech);
  } catch (err) {
    log({ callSid: CallSid, stage: 'intent', error: 'claude_error' });
  }

  if (!intent) return send(res, transfer(vr, CallSid, 'Let me connect you with a staff member.', 'classify_failed'));

  log({ callSid: CallSid, stage: 'intent', category: intent.category, ms: Date.now() - started });

  if (intent.category === 'urgent') return send(res, urgentTransfer(vr, CallSid, 'urgent_model'));

  call.category = intent.category;
  send(res, listen(vr, '/confirm', `${intent.reply} Is that right?`));
});

app.post('/confirm', fromTwilio, (req, res) => {
  const { CallSid } = req.body;
  const speech = req.body.SpeechResult || '';
  const call = getCall(CallSid);
  const vr = new VoiceResponse();

  if (!call.verified) {
    vr.redirect({ method: 'POST' }, url('/voice'));
    return send(res, vr);
  }

  if (isUrgent(speech)) return send(res, urgentTransfer(vr, CallSid, 'urgent_keyword_at_confirm'));

  if (parseYesNo(speech) === 'yes') {
    log({ callSid: CallSid, stage: 'confirm', category: call.category, outcome: 'confirmed' });
    vr.say(
      { voice: VOICE },
      "Great. I've passed your request to our staff, and someone will follow up with you. " +
        'Thanks for calling Sunrise Family Clinic. Goodbye.'
    );
    vr.hangup();
    endCall(CallSid);
    return send(res, vr);
  }

  call.intentAttempts += 1;
  if (call.intentAttempts < MAX_INTENT_ATTEMPTS) {
    log({ callSid: CallSid, stage: 'confirm', outcome: 'rejected_retry' });
    return send(res, listen(vr, '/intent', 'Sorry about that. Please tell me again how I can help.'));
  }
  send(res, transfer(vr, CallSid, 'Let me connect you with a staff member who can help.', 'confirm_failed'));
});

app.post('/status', fromTwilio, (req, res) => {
  const { CallSid, CallStatus } = req.body;
  if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)) {
    endCall(CallSid);
    log({ callSid: CallSid, stage: 'status', status: CallStatus });
  }
  res.sendStatus(204);
});

app.use((err, req, res, next) => {
  log({ callSid: req.body?.CallSid, stage: 'error', error: err.name });
  res.status(500).type('text/plain').send('Internal error');
});

const port = process.env.PORT || 3000;
app.listen(port, (err) => {
  if (err) {
    console.error(`Could not start server: ${err.message}`);
    process.exit(1);
  }
  console.log(`Server listening on port ${port}`);
});