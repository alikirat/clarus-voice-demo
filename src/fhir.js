export async function findPatient({ firstName, lastName, birthDate }) {
  const params = new URLSearchParams({
    family: lastName,
    given: firstName,
    birthdate: birthDate,
    _count: '5',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${process.env.FHIR_BASE_URL}/Patient?${params}`, {
      headers: { Accept: 'application/fhir+json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`FHIR ${res.status}`);
    const bundle = await res.json();
    const patient = bundle.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource;
    return patient ? { id: patient.id } : null;
  } finally {
    clearTimeout(timer);
  }
}