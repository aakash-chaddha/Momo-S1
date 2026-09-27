// The sample evidence offered in 01 / evidence. These are ordinary product screenshots (a mail
// client, a helpdesk, a checkout, an error page), rendered by `e2e/make-samples.mjs` and shipped
// in public/samples/: the model is asked to read them the way it reads a screenshot a customer
// sent in, so they must be evidence, not decoration.
export interface Sample {
  /** file under public/samples */
  file: string;
  /** what it is, in a sentence */
  name: string;
  /** what makes it interesting to a decision */
  caption: string;
}

export const SAMPLES: Sample[] = [
  {
    file: 'complaint-billing.png',
    name: 'complaint · double charge',
    caption: 'an invoice charged twice, with the statement attached',
  },
  {
    file: 'complaint-delivery.png',
    name: 'complaint · damaged delivery',
    caption: 'a helpdesk ticket asking for a replacement before a deadline',
  },
  {
    file: 'complaint-crash.png',
    name: 'complaint · app crashing',
    caption: 'an angry email quoting the error it shows',
  },
  {
    file: 'error-502.png',
    name: 'screenshot · error page',
    caption: 'an error code and a stack trace in the pixels',
  },
  {
    file: 'checkout-declined.png',
    name: 'screenshot · checkout',
    caption: 'a declined card and the amount at stake',
  },
  {
    file: 'login-expired.png',
    name: 'screenshot · sign-in',
    caption: 'a second factor that expired, and the account it blocks',
  },
];

export const sampleUrl = (file: string) =>
  `${import.meta.env.BASE_URL}samples/${file}`;

export async function fetchSample(sample: Sample): Promise<File> {
  const res = await fetch(sampleUrl(sample.file));
  if (!res.ok) throw new Error(`${sample.file}: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], sample.file, { type: blob.type || 'image/png' });
}
