import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';
import { extractIdentity, classifyIntent } from './claude.js';
import { isUrgent } from './urgent.js';
import { findPatient } from './fhir.js';
import { getCall, endCall } from './state.js';

const { VoiceResponse } = twilio.twiml;
const VOICE = 'Polly.Joanna';
const MAX_VERIFY_ATTEMPTS = 2;
const MAX_INTENT_ATTEMPTS = 2;

const app = express();
app.use(express.urlencoded({ extended: false }));

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

function transfer(vr, callSid, message) {
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

function urgentTransfer(vr, callSid) {
  return transfer(
    vr,
    callSid,
    "If this is a life threatening emergency, please hang up and dial 9 1 1. I'm connecting you to our on-call team now."
  );
}

app.post('/voice', (req, res) => {
  getCall(req.body.CallSid);
  const vr = new VoiceResponse();
  listen(
    vr,
    '/verify',
    'Hello, and thank you for calling Sunrise Family Clinic. ' +
      'Please say your first and last name, and your date of birth.'
  );
  send(res, vr);
});

app.post('/verify', async (req, res) => {
  const { CallSid } = req.body;
  const speech = req.body.SpeechResult || '';
  const call = getCall(CallSid);
  const vr = new VoiceResponse();

  const retryOrTransfer = (retryPrompt) => {
    call.verifyAttempts += 1;
    if (call.verifyAttempts < MAX_VERIFY_ATTEMPTS) {
      return send(res, listen(vr, '/verify', retryPrompt));
    }
    return send(res, transfer(vr, CallSid, "I wasn't able to find your record. Let me connect you with a staff member."));
  };

  if (!speech.trim()) {
    return retryOrTransfer("Sorry, I didn't hear anything. Please say your first and last name, and your date of birth.");
  }

  let identity;
  try {
    identity = await extractIdentity(speech);
  } catch (err) {
    console.error('extractIdentity failed:', err.message);
    return send(res, transfer(vr, CallSid, 'Let me connect you with a staff member.'));
  }

  if (!identity) {
    return retryOrTransfer(
      "Sorry, I didn't catch all of that. Please say your first name, last name, and date of birth, including the year."
    );
  }

  let patient;
  try {
    patient = await findPatient(identity);
  } catch (err) {
    console.error('findPatient failed:', err.message);
    return send(res, transfer(vr, CallSid, "I'm having trouble looking up your record. Let me connect you with a staff member."));
  }

  if (!patient) {
    return retryOrTransfer(
      "I couldn't find a match. Let's try once more. Please say your first and last name, and your date of birth."
    );
  }

  call.verified = true;
  call.patientId = patient.id;
  send(res, listen(vr, '/intent', 'Thank you, I found your record. How can I help you today?'));
});

app.post('/intent', async (req, res) => {
  const { CallSid } = req.body;
  const speech = req.body.SpeechResult || '';
  const call = getCall(CallSid);
  const vr = new VoiceResponse();

  if (!call.verified) {
    vr.redirect({ method: 'POST' }, url('/voice'));
    return send(res, vr);
  }

  if (isUrgent(speech)) return send(res, urgentTransfer(vr, CallSid));

  if (!speech.trim()) {
    call.intentAttempts += 1;
    if (call.intentAttempts < MAX_INTENT_ATTEMPTS) {
      return send(res, listen(vr, '/intent', "Sorry, I didn't hear anything. How can I help you today?"));
    }
    return send(res, transfer(vr, CallSid, 'Let me connect you with a staff member.'));
  }

  let intent = null;
  try {
    intent = await classifyIntent(speech);
  } catch (err) {
    console.error('classifyIntent failed:', err.message);
  }

  if (!intent) return send(res, transfer(vr, CallSid, 'Let me connect you with a staff member.'));
  if (intent.category === 'urgent') return send(res, urgentTransfer(vr, CallSid));

  call.category = intent.category;
  send(res, listen(vr, '/confirm', `${intent.reply} Is that right?`));
});

// Temporary placeholder, replaced in Step 8
app.post('/confirm', (req, res) => {
  const vr = new VoiceResponse();
  vr.say({ voice: VOICE }, 'Thanks. A staff member will follow up with you. Goodbye.');
  vr.hangup();
  endCall(req.body.CallSid);
  send(res, vr);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});