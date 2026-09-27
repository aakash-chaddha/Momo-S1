// Presets suited to a 450M VLM. Each one is a complete question: instructions, a compact schema
// (the same object the endpoint takes) and the context text.
//
// A preset ships at most three fields: a small question is the honest one for this model, and it
// keeps the cost of a pass visible. Three is a starting point, never a limit - the form adds as
// many fields as the reader wants, up to the endpoint's own 64.
export interface Preset {
  id: string;
  name: string;
  blurb: string;
  instructions: string;
  schema: Record<string, unknown>;
  context: string;
  needsImage?: boolean;
}

const e = (choices: string[], description: string) => ({
  type: 'enum',
  choices,
  description,
});
const b = (description: string) => ({ type: 'boolean', description });

export const PRESETS: Preset[] = [
  {
    id: 'email',
    name: 'Email triage · 3 fields',
    blurb:
      'Three fields on an inbound email: what it is about, how hot it is, and whether a person has to step in.',
    needsImage: true,
    instructions: `You triage one inbound email. It arrives as text, and often with a screenshot of the product or the receipt attached. Read both: the screenshot shows what actually happened, the email shows what the sender wants.
category: what went wrong, from the words and the pixels. double_charge for one invoice or order charged more than once, or charged wrongly; damaged_delivery for an order that arrived damaged, late or incomplete; crashing_app for a product that crashes, shows errors or will not load; other when nothing fits.
urgency: critical when the sender is blocked or loses money or data right now; high when there is a deadline inside a week; normal for everything that waits its turn; low for feedback and praise.
needs_human: true when a person must answer (an angry sender, a refund, a promise, a legal mention), false when a template reply or the queue can settle it.`,
    schema: {
      category: e(
        ['double_charge', 'damaged_delivery', 'crashing_app', 'other'],
        'What went wrong, per the email and its pixels.'
      ),
      urgency: e(
        ['low', 'normal', 'high', 'critical'],
        'How hot it is, per the rules.'
      ),
      needs_human: b('True when a person has to answer.'),
    },
    context:
      'Triage this email. Decide from the attached screenshot and the words of the email; do not invent an order, an amount or a deadline that is not in them.',
  },
  {
    id: 'screenshot',
    name: 'Screenshot triage · 3 fields',
    blurb:
      'Three fields on a product screenshot alone: which screen it is, whether it shows an error, and how urgent it is.',
    needsImage: true,
    instructions: `You look at one screenshot of a product and answer from the pixels alone. No message comes with it, so the screen is all the evidence you get.
screen: which screen the screenshot shows. error_page for a failure page or a crash report; checkout for payment and card screens; sign_in for login and 2FA screens; other when nothing fits.
error_visible: true only when the screenshot itself shows an error code, an error message, a stack trace or a failure banner.
priority: critical for a failed payment or a crash with a stack trace; high for anything blocking the user out of the product; normal for ordinary screens; low when the screen shows nothing wrong.`,
    schema: {
      screen: e(
        ['error_page', 'checkout', 'sign_in', 'other'],
        'Which screen the screenshot shows.'
      ),
      error_visible: b(
        'True only when the pixels show an error code, message or stack trace.'
      ),
      priority: e(
        ['low', 'normal', 'high', 'critical'],
        'Priority per the rules.'
      ),
    },
    context: 'Decide from the attached screenshot only. Do not guess beyond what the pixels show.',
  },
  {
    id: 'text-control',
    name: 'Ticket routing, text only · 3 fields',
    blurb:
      'No image: the same engine on a text context, useful as a control against the multimodal runs.',
    instructions:
      'Answer each question about this support request from its state.',
    schema: {
      category: e(
        ['double_charge', 'damaged_delivery', 'crashing_app', 'other'],
        'What went wrong, per the message.'
      ),
      urgent: b('Does this need urgent handling?'),
      priority: e(
        ['low', 'medium', 'high', 'critical'],
        'Rate support priority.'
      ),
    },
    context: JSON.stringify(
      {
        message: 'I was charged twice and need this fixed today.',
        customerPlan: 'Pro',
        accountAgeDays: 420,
      },
      null,
      2
    ),
  },
];

export const DEFAULT_PRESET = PRESETS[0];
