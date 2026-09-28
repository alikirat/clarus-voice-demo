import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';
import { extractIdentity } from './claude.js';

const { VoiceResponse } = twilio.twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));

function listen(vr, action, prompt) {
  const gather = vr.gather({
    input: 'speech',
    action,
    method: 'POST',
    speechModel: 'phone_call',
    enhanced: true,
    actionOnEmptyResult: true,
  });
  gather.say({ voice: 'Polly.Joanna' }, prompt);
}

app.post('/voice', (req, res) => {
  const vr = new VoiceResponse(); 
  listen(
    vr,
    `${process.env.PUBLIC_BASE_URL}/verify`,
    'Hello, and thank you for calling Sunrise Family Clinic. ' +
      'Please say your first and last name, and your date of birth.'
  );

  res.type('text/xml').send(vr.toString());
});

app.post('/verify', async (req, res) => {
  const vr = new VoiceResponse();
  const speech = req.body.SpeechResult || '';

  if (!speech.trim()) {
    vr.say({ voice: 'Polly.Joanna' }, "I'm sorry, I didn't hear anything.");
    return res.type('text/xml').send(vr.toString());
  }

  try {
    const identity = await extractIdentity(speech);
    if (identity) {
      vr.say(
        { voice: 'Polly.Joanna' },
        `I heard ${identity.firstName} ${identity.lastName}, born ${identity.birthDate}.`
      );
    } else {
      vr.say({ voice: 'Polly.Joanna' }, "Sorry, I didn't catch all of that.");
    }
  } catch (err) {
    console.error('extractIdentity failed:', err.message);
    vr.say({ voice: 'Polly.Joanna' }, 'Sorry, something went wrong on our end.');
  }

  res.type('text/xml').send(vr.toString());
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
