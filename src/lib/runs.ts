import type {
  ChatCompletionUsage,
  ChatCompletionUserMessage,
  DecisionRequest,
  DecisionResponse,
  ResultTimings,
  Wllama,
} from '@wllama/wllama';
import { toJsonSchema, type Json } from './schema';

export interface DecisionRun {
  running: boolean;
  status: string;
  error: string;
  wallMs: number | null;
  response: DecisionResponse | null;
  request: DecisionRequest | null;
}

export const idleDecisionRun: DecisionRun = {
  running: false,
  status: '',
  error: '',
  wallMs: null,
  response: null,
  request: null,
};

export interface GenerationAnswer {
  contextIndex: number;
  text: string;
  ttftMs: number | null;
  wallMs: number;
  promptMs: number | null;
  predictedMs: number | null;
  predictedN: number | null;
  usage: ChatCompletionUsage | null;
}

export interface GenerationRun {
  running: boolean;
  status: string;
  error: string;
  answers: GenerationAnswer[];
  current: string;
  currentIndex: number;
}

export const idleGenerationRun: GenerationRun = {
  running: false,
  status: '',
  error: '',
  answers: [],
  current: '',
  currentIndex: 0,
};

// One call to createDecision: the page measures the wall itself, the response carries the
// engine's own split (prefill / scoring) so the two can be told apart.
export async function runDecision(
  wllama: Wllama,
  body: DecisionRequest,
  signal: AbortSignal
): Promise<{ response: DecisionResponse; wallMs: number }> {
  const t0 = performance.now();
  const response = await wllama.createDecision({ ...body, abortSignal: signal });
  return { response, wallMs: performance.now() - t0 };
}

export interface GenerationInput {
  instructions: string;
  schema: Json;
  contexts: DecisionRequest['contexts'];
  images: (ArrayBuffer | null)[];
}

export function systemPrompt(instructions: string, schema: Json): string {
  const jsonSchema = toJsonSchema(schema);
  return (
    (instructions.trim() ? instructions.trim() + '\n\n' : '') +
    'Answer with one JSON object that matches this JSON Schema. Output only the JSON object.\n' +
    JSON.stringify(jsonSchema, null, 2)
  );
}

// The request body as it would be sent to POST /v1/chat/completions, with the image bytes replaced
// by their size so the raw view stays readable.
export function generationRequestBody(input: GenerationInput, index: number) {
  const text =
    typeof input.contexts[index] === 'string'
      ? (input.contexts[index] as string)
      : '';
  const image = input.images[index];
  return {
    messages: [
      { role: 'system', content: systemPrompt(input.instructions, input.schema) },
      {
        role: 'user',
        content: image
          ? [
              ...(text ? [{ type: 'text', text }] : []),
              { type: 'image', data: `<${Math.round(image.byteLength / 1024)} KB jpeg>` },
            ]
          : text,
      },
    ],
    stream: true,
    max_tokens: 512,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'decision', schema: toJsonSchema(input.schema), strict: true },
    },
    chat_template_kwargs: { enable_thinking: false },
  };
}

// The comparison run: the same question asked as a JSON-constrained completion, once per context,
// sequentially, so its timings are not contaminated by the decision pass.
export async function runGeneration(
  wllama: Wllama,
  input: GenerationInput,
  signal: AbortSignal,
  onChunk: (contextIndex: number, text: string, ttftMs: number) => void
): Promise<GenerationAnswer[]> {
  const jsonSchema = toJsonSchema(input.schema);
  const system = systemPrompt(input.instructions, input.schema);

  const answers: GenerationAnswer[] = [];
  for (let i = 0; i < input.contexts.length; i++) {
    if (signal.aborted) break;
    const context = input.contexts[i];
    const text = typeof context === 'string' ? context : '';
    const image = input.images[i];
    const content: ChatCompletionUserMessage['content'] = image
      ? [
          ...(text ? [{ type: 'text' as const, text }] : []),
          { type: 'image' as const, data: image },
        ]
      : text;

    const t0 = performance.now();
    let first: number | null = null;
    let acc = '';
    let timings: ResultTimings | null = null;
    let usage: ChatCompletionUsage | null = null;

    await wllama.createChatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      stream: true,
      max_tokens: 512,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'decision', schema: jsonSchema, strict: true },
      },
      chat_template_kwargs: { enable_thinking: false },
      abortSignal: signal,
      onData: (chunk) => {
        const piece = chunk.choices?.[0]?.delta?.content ?? '';
        if (piece && first === null) {
          first = performance.now() - t0;
        }
        if (piece) {
          acc += piece;
          onChunk(i, acc, first ?? performance.now() - t0);
        }
        if (chunk.timings) timings = chunk.timings;
        if (chunk.usage) usage = chunk.usage;
      },
    });
    const wallMs = performance.now() - t0;
    const t = timings as ResultTimings | null;
    answers.push({
      contextIndex: i,
      text: acc,
      ttftMs: first,
      wallMs,
      promptMs: t?.prompt_ms ?? null,
      predictedMs: t?.predicted_ms ?? null,
      predictedN: t?.predicted_n ?? null,
      usage,
    });
  }
  return answers;
}
