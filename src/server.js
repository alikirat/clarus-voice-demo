import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';

const { VoiceResponse } = twilio.twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/voice', (req, res) => {
  const vr = new VoiceResponse();
  vr.say(
    { voice: 'Polly.Joanna' },
    'Hello, and thank you for calling Sunrise Family Clinic.'
  );

  res.type('text/xml').send(vr.toString());
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
