import Anthropic from '@anthropic-ai/sdk';
import { LMProvider } from '../../core/lmProvider';

/** Preferred → fallback. Only the first model that the API accepts is used. */
const PREFERRED_MODELS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-3-5-sonnet-latest',
];

const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicLmOptions {
  apiKey: string;
  /** Optional override; defaults to PREFERRED_MODELS[0]. */
  model?: string;
  /** Optional override for max_tokens; defaults to 4096. */
  maxTokens?: number;
}

/**
 * Direct-to-Anthropic LMProvider. Streams text deltas through `messages.stream`
 * and forwards AbortSignal cancellation to the underlying request.
 */
export class AnthropicLmProvider implements LMProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(opts: AnthropicLmOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model || PREFERRED_MODELS[0];
    this.maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
  }

  async *sendRequest(
    systemPrompt: string,
    userContent: string,
    signal: AbortSignal,
  ): AsyncIterable<string> {
    if (signal.aborted) return;

    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
