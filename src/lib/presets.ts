// Presets suited to a 450M VLM. Each one is a complete question: instructions, a compact schema
// (the same object the endpoint takes) and the context text.
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
const int = (minimum: number, maximum: number, description: string) => ({
  type: 'integer',
  minimum,
  maximum,
  description,
});

export const PRESETS: Preset[] = [
  {
    id: 'photo',
    name: 'What is in this photo · 8 fields',
    blurb:
      'Subject, count, place and any text in the pixels. Attach an image under Evidence.',
    needsImage: true,
    instructions: `You describe the image that comes with the request. The pixels are the evidence: the subject, how many, where it was taken and any text that is actually visible.
kind: the main subject. animal for a living creature, person when a human is the subject, object for a product, vehicle or tool, document for a page of text, screenshot for a capture of a device or application UI, scene for a landscape or room with no clear subject.
count: how many of the main subject are visible, capped at 9; count carefully.
indoors: true when the scene is inside a building, a vehicle or a room.
setting: the place the photo was taken, from the visible background only.
text_in_image: true only when letters or numbers are readable in the image itself.
text_kind: what the readable text is, none when there is none.
color: the colour that covers most of the image.
time_of_day: day when the light is clearly daylight, night when it is clearly dark, unclear otherwise.`,
    schema: {
      kind: e(
        ['animal', 'person', 'object', 'document', 'screenshot', 'scene'],
        'The main subject of the image.'
      ),
      count: int(1, 9, 'How many of the main subject are visible, capped at 9.'),
      indoors: b('True when the scene is inside a building, vehicle or room.'),
      setting: e(
        ['indoors', 'outdoors', 'urban', 'nature', 'unclear'],
        'Where the photo was taken, from the visible background.'
      ),
      text_in_image: b('True only when letters or numbers are readable in the image.'),
      text_kind: e(
        ['none', 'sign', 'label', 'document', 'ui', 'handwriting'],
        'What the readable text is, none when there is none.'
      ),
      color: e(
        ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white', 'grey', 'black', 'brown'],
        'The colour that covers most of the image.'
      ),
      time_of_day: e(['day', 'night', 'unclear'], 'Daylight, dark or unclear.'),
    },
    context:
      'Decide from the attached image. Do not guess beyond what the pixels show.',
  },
  {
    id: 'screenshot',
    name: 'Screenshot routing · 5 fields',
    blurb:
      'Route a support screenshot: product area, team, priority, error text, deadline.',
    needsImage: true,
    instructions: `You route an inbound customer message and, when one is attached, the screenshot that came with it.
The screenshot is the strongest evidence: decide from the screen it shows, its error text and its button labels before the wording of the message.
category: the product area of the screen. billing for payment, invoice, refund and checkout screens; technical for error pages, crashes and blank screens; account for login, 2FA and profile screens; cancellation when the customer wants to stop the plan; other when nothing matches.
escalate_to: billing when the screen or the message is about money, engineering for error pages and blank screens, trust_safety for fraud or abuse, none when the queue can handle it.
priority: critical for a failed payment or data loss, high when the customer is blocked, normal for questions, low for feedback.
error_code_visible: true only when the screenshot shows an error code or a stack trace.
sla_hours: critical = 1, high = 4, normal = 24, low = 72.`,
    schema: {
      category: e(
        ['billing', 'technical', 'account', 'cancellation', 'other'],
        'Product area shown in the screenshot.'
      ),
      escalate_to: e(
        ['none', 'billing', 'engineering', 'trust_safety'],
        'Team per the rules.'
      ),
      priority: e(['low', 'normal', 'high', 'critical'], 'Priority per the rules.'),
      error_code_visible: b(
        'True only when the screenshot shows an error code or stack trace.'
      ),
      sla_hours: e(['1', '4', '24', '72'], 'Deadline that matches the priority.'),
    },
    context: JSON.stringify(
      {
        message:
          'Tried again this morning and it still does the same thing. Our launch is on Friday, can someone look at this today?',
        screenshotAttached: true,
        customerPlan: 'Business',
        accountAgeDays: 260,
        previousTickets: 3,
      },
      null,
      2
    ),
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
        ['billing', 'technical', 'cancellation', 'other'],
        'What type of support request is this?'
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
