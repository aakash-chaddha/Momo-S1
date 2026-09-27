/// <reference types="webmcp-types" />
// WebMCP (https://github.com/webmachinelearning/webmcp): this page registers its own functions as
// tools on `document.modelContext`, so a browser agent can load the model, set the evidence and
// the question, run either pass and read the result - without scraping the DOM or re-driving the
// buttons. The tools wrap the exact handlers the UI uses, so an agent's run is the same run the
// reader would get from stage 03 / 04 / 05, in the same state, on the same engine.
//
// Registration is a no-op where the browser has no WebMCP (Chrome/Edge behind
// `about:flags#enable-webmcp-testing`, ChatGPT Desktop today). Tools are registered once and
// unregistered together by aborting the signal, per the spec's lifecycle.
import { MODELS } from '../config';
import { PRESETS } from './presets';
import { SAMPLES } from './samples';

export type ToolJson = Record<string, unknown>;

export interface EvidenceInput {
  /** a file name from the page's samples */
  sample?: string;
  /** a data: or https: URL of an image to load as the evidence */
  imageUrl?: string;
  /** the context text the question is asked against */
  text?: string;
  /** drop the image that is currently set */
  clearImage?: boolean;
}

export interface QuestionInput {
  instructions?: string;
  /** the endpoint's schema: compact fields or JSON Schema */
  schema?: ToolJson;
}

/** The page functions the tools call. A tool never touches React state directly. */
export interface MomosTools {
  status: () => ToolJson;
  loadModel: (model?: string) => Promise<ToolJson>;
  setEvidence: (input: EvidenceInput) => Promise<ToolJson>;
  applyPreset: (preset: string) => ToolJson;
  setQuestion: (input: QuestionInput) => ToolJson;
  runDecision: (signal?: AbortSignal) => Promise<ToolJson>;
  runGeneration: (signal?: AbortSignal) => Promise<ToolJson>;
  runBoth: (signal?: AbortSignal) => Promise<ToolJson>;
  stopRun: () => ToolJson;
}

const MODELS_ENUM = MODELS.map((m) => m.id);
const PRESETS_ENUM = PRESETS.map((p) => p.id);
const SAMPLES_ENUM = SAMPLES.map((s) => s.file);

const stringEnum = (values: string[], description: string) => ({
  type: 'string',
  enum: values,
  description,
});

/** The tool catalogue. One page function each; names are verbs, descriptions say when to use it. */
function toolCatalogue(h: () => MomosTools): WebMCP.ModelContextTool[] {
  return [
    {
      name: 'get-page-state',
      title: 'Read the page state',
      description:
        'Returns the whole current state of this page as JSON: whether the model is loaded and which one, the evidence (image and context text), the question (instructions, schema, preset), the samples and presets offered, and the results of the last one-pass decision and the last token-by-token generation. Read this first: it tells you what is loaded and what has already run.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => h().status(),
    },
    {
      name: 'load-model',
      title: 'Load the model',
      description:
        'Loads the multimodal model and the engine into this page. The first call downloads the weights (~307 MiB for the default model) and the browser caches them, so later calls are fast. Pass `model` to switch to another model first, which drops whatever is loaded. Resolves when the engine is ready to decide.',
      inputSchema: {
        type: 'object',
        properties: {
          model: stringEnum(
            MODELS_ENUM,
            `Which model to load. Omit to load the one the page is set to (${MODELS_ENUM[0]}).`
          ),
        },
        additionalProperties: false,
      },
      execute: (input) => h().loadModel(input?.model as string | undefined),
    },
    {
      name: 'set-evidence',
      title: 'Set the evidence',
      description:
        'Sets what the model gets to look at: one image and/or the context text. An image replaces the image that is there (only one at a time). Pass `sample` for one of the page\'s samples, or `imageUrl` for your own image (a data: or https: URL). Pass `text` to set the context text, `clearImage: true` to drop the image.',
      inputSchema: {
        type: 'object',
        properties: {
          sample: stringEnum(SAMPLES_ENUM, 'One of the shipped samples, by file name.'),
          imageUrl: {
            type: 'string',
            description: 'A data: or https: URL of the image to use as evidence.',
          },
          text: {
            type: 'string',
            description: 'The context text. Replaces the text that is there.',
          },
          clearImage: {
            type: 'boolean',
            description: 'Drop the current image and run on text alone.',
          },
        },
        additionalProperties: false,
      },
      execute: (input) => h().setEvidence((input ?? {}) as EvidenceInput),
    },
    {
      name: 'apply-preset',
      title: 'Apply a question preset',
      description:
        'Loads one of the shipped questions - instructions, a finite schema and the context text - into the form. A preset ships at most three fields and is a start, not a limit.',
      inputSchema: {
        type: 'object',
        properties: {
          preset: stringEnum(
            PRESETS_ENUM,
            'Which preset to load. See get-page-state for what each one asks.'
          ),
        },
        required: ['preset'],
        additionalProperties: false,
      },
      execute: (input) => h().applyPreset(String(input?.preset ?? '')),
    },
    {
      name: 'set-question',
      title: 'Set the question',
      description:
        'Sets the instructions and/or the schema the model decides against. The schema is the endpoint\'s own: either compact fields ({\"field\": {\"type\": \"enum\", \"choices\": [...], \"description\": \"...\"}}) or JSON Schema with properties. Every field needs a finite set of allowed values: enum with choices, boolean, or integer/number with minimum and maximum. The schema is validated here and a bad one is rejected with the reason.',
      inputSchema: {
        type: 'object',
        properties: {
          instructions: {
            type: 'string',
            description: 'How to decide each field. Replaces the instructions that are there.',
          },
          schema: {
            type: 'object',
            description:
              'The finite schema to score. Replaces the schema that is there. Compact fields or JSON Schema.',
          },
        },
        additionalProperties: false,
      },
      execute: (input) => h().setQuestion((input ?? {}) as QuestionInput),
    },
    {
      name: 'run-decision',
      title: 'Run the decision (one pass)',
      description:
        'Scores the whole schema against the current evidence in one batched forward pass and returns the assembled answer, a probability per field (plus the full distribution where it was scored exhaustively), and the engine\'s timing split. Needs the model loaded and an image or some context text.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: (_input, options) => h().runDecision(options?.signal),
    },
    {
      name: 'run-generation',
      title: 'Run token by token',
      description:
        'Writes the same answer the slow way: JSON-constrained autoregressive generation over the current evidence, streamed as it arrives. Returns the generated JSON per context with the wall time and first-token time, for comparison against run-decision.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: (_input, options) => h().runGeneration(options?.signal),
    },
    {
      name: 'run-both',
      title: 'Run both back to back',
      description:
        'Runs the one-pass decision first, then the token-by-token generation, so the two wall times and the two answers come from a pair that ran on the same question, one after the other. This is the comparison the page is built around.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: (_input, options) => h().runBoth(options?.signal),
    },
    {
      name: 'stop-run',
      title: 'Stop the run in flight',
      description:
        'Aborts whichever run is in flight (the decision or the generation), the same as the page\'s stop button.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => h().stopRun(),
    },
  ];
}

/**
 * Registers the page's tools once. Returns a function that unregisters them all. A browser
 * without WebMCP gets a no-op and the page works exactly as before.
 */
export function installWebMcpTools(handlers: () => MomosTools): () => void {
  const mc = typeof document === 'undefined' ? undefined : document.modelContext;
  if (!mc) return () => undefined;

  const ctrl = new AbortController();
  for (const tool of toolCatalogue(handlers)) {
    mc.registerTool(tool, { signal: ctrl.signal }).catch((e: unknown) => {
      console.warn(`[webmcp] ${tool.name}:`, (e as Error)?.message ?? e);
    });
  }
  return () => ctrl.abort();
}
