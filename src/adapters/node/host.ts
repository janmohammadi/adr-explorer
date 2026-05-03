import { WebSocket } from 'ws';
import { Host, HostDisposable } from '../../core/host';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../core/types';

/**
 * WebSocket-backed host. Adopts a single client connection at a time; if a
 * second client connects, the older one is dropped so we never split state.
 *
 * The CLI server constructs one of these per process and replaces the active
 * socket whenever a fresh browser tab connects.
 */
export class WebSocketHost implements Host {
  private socket: WebSocket | undefined;
  private messageHandlers = new Set<(msg: WebviewToExtensionMessage) => void>();
  /** Outbound messages sent before any socket attached are queued briefly. */
  private outbox: ExtensionToWebviewMessage[] = [];

  /** Attach (or replace) the active client socket. */
  attach(socket: WebSocket): void {
    if (this.socket && this.socket !== socket) {
      try { this.socket.close(1000, 'replaced'); } catch { /* ignore */ }
    }
    this.socket = socket;

    socket.on('message', (raw) => {
      let msg: WebviewToExtensionMessage;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      for (const h of this.messageHandlers) {
        try { h(msg); } catch (err: any) {
          // Surface to terminal so the CLI operator can see it; keep going.
          console.error('[adr-explorer] handler error:', err?.message || err);
        }
      }
    });

    socket.on('close', () => {
      if (this.socket === socket) this.socket = undefined;
    });

    // Flush queued outbound messages (e.g. an initial snapshot sent before
    // the WS upgrade completed).
    while (this.outbox.length > 0) {
      const m = this.outbox.shift()!;
      this.send(m);
    }
  }

  send(msg: ExtensionToWebviewMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify(msg)); }
      catch (err: any) { console.error('[adr-explorer] ws send failed:', err?.message || err); }
    } else {
      // Cap the queue so a long-disconnected session doesn't grow unbounded.
      if (this.outbox.length < 64) this.outbox.push(msg);
    }
  }

  onMessage(handler: (msg: WebviewToExtensionMessage) => void): HostDisposable {
    this.messageHandlers.add(handler);
    return { dispose: () => { this.messageHandlers.delete(handler); } };
  }

  notify(level: 'info' | 'warn' | 'error', message: string): void {
    // Mirror to the terminal, then push a `notify` message to the webview so
    // the user sees something in the browser too.
    const tag = level === 'error' ? '[error]' : level === 'warn' ? '[warn]' : '[info]';
    console.log(`${tag} ${message}`);
    this.send({ type: 'notify', level, message });
  }
}
