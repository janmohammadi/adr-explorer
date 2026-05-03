import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './types';

export interface HostDisposable {
  dispose(): void;
}

/**
 * Host-neutral abstraction for the bidirectional channel to the webview UI.
 * Implementations:
 *  - VsCodeWebviewHost: wraps vscode.WebviewPanel.
 *  - WebSocketHost: wraps a `ws` connection to the browser.
 *
 * The optional `extensions` block exposes hooks that only some hosts can
 * fulfill (e.g. opening a file in a side editor). The CLI host leaves them
 * unset; the VS Code host wires them up.
 */
export interface Host {
  send(msg: ExtensionToWebviewMessage): void;
  onMessage(handler: (msg: WebviewToExtensionMessage) => void): HostDisposable;
  notify(level: 'info' | 'warn' | 'error', message: string): void;
  /**
   * Hooks fulfilled only by the VS Code host. The CLI host ignores them
   * and the message router falls back to a notification or no-op.
   */
  extensions?: {
    /** Reveal the ADR file in an editor next to the webview. */
    openInEditor?(filePath: string): Promise<void>;
    /** Render distill diagnostics in the editor (squiggles). */
    setDistillDiagnostics?(filePath: string, suggestions: { target: string; replacement: string; reason: string; category: string }[]): void;
    /** Clear distill diagnostics for a file. */
    clearDistillDiagnostics?(filePath: string): void;
  };
}
