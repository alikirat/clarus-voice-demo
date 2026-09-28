import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';

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

app.post('/verify', (req, res) => {
  const vr = new VoiceResponse();
  const speech = req.body.SpeechResult;

  if (speech) {
    vr.say({ voice: 'Polly.Joanna' }, `You said: ${speech}`);
  } else {
    vr.say({ voice: 'Polly.Joanna' }, "I'm sorry, I didn't hear anything.");
  }

  res.type('text/xml').send(vr.toString());
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
