import 'dotenv/config';

const base = process.env.FHIR_BASE_URL;
const [first = 'Maria', last = 'Garcia', birthDate = '1985-04-12'] = process.argv.slice(2);

const search = new URLSearchParams({ family: last, given: first, birthdate: birthDate });
const existing = await fetch(`${base}/Patient?${search}`).then((r) => r.json());

if (existing.entry?.length) {
  console.log(`Already exists: Patient/${existing.entry[0].resource.id}`);
} else {
  const res = await fetch(`${base}/Patient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: JSON.stringify({
      resourceType: 'Patient',
      name: [{ family: last, given: [first] }],
      birthDate,
    }),
  });
  if (!res.ok) throw new Error(`Create failed: ${res.status}`);
  const created = await res.json();
  console.log(`Created Patient/${created.id}`);
}