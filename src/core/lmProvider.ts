/**
 * Host-neutral language model abstraction. Implementations:
 *  - VsCodeLmProvider: wraps vscode.lm (GitHub Copilot bridge).
 *  - AnthropicLmProvider: direct Anthropic API (used by the CLI/web target).
 */
export interface LMProvider {
  /**
   * Send a prompt and stream back text chunks. The returned async iterable
   * yields raw text deltas in order. Implementations must honor `signal`
   * to cancel the in-flight request.
   */
  sendRequest(
    systemPrompt: string,
    userContent: string,
    signal: AbortSignal
  ): AsyncIterable<string>;
}
