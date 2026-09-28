import 'dotenv/config';
import { createApp } from './app.js';

const required = ['TWILIO_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'PUBLIC_BASE_URL', 'FHIR_BASE_URL'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  process.exit(1);
}

const port = process.env.PORT || 3000;
createApp().listen(port, (err) => {
  if (err) {
    console.error(`Could not start server: ${err.message}`);
    process.exit(1);
  }
  console.log(`Server listening on port ${port}`);
});