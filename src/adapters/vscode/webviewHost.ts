import * as vscode from 'vscode';
import { Host, HostDisposable } from '../../core/host';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../core/types';
import { getNonce } from '../../core/utils';
import { buildExplorerHtml } from '../../core/explorerHtml';

/**
 * VS Code webview host. Owns the panel lifecycle, HTML/CSP, and the
 * extension-only hooks (open-in-editor, distill diagnostics).
 */
export class VsCodeWebviewHost implements Host {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private messageHandlers = new Set<(msg: WebviewToExtensionMessage) => void>();
  private diagSourceTag = 'adr-distill';

  /** True for the lifetime of an open panel; false once disposed. */
  get isOpen(): boolean { return this.panel !== undefined; }

  constructor(
    private extensionUri: vscode.Uri,
    private diagnostics: vscode.DiagnosticCollection,
  ) {}

  /** Open or reveal the panel. Idempotent. */
  showPanel(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'adrExplorer.explorerView',
      'ADR Explorer',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.extensionUri, 'media'),
        ],
      }
    );

    this.panel.webview.html = this.getPanelHtml(this.panel.webview);
    this.panel.iconPath = new vscode.ThemeIcon('layout');

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtensionMessage) => {
        for (const h of this.messageHandlers) {
          try { h(msg); } catch (err: any) {
            vscode.window.showErrorMessage(`ADR Explorer: handler error: ${err?.message || err}`);
          }
        }
      },
      undefined,
      this.panelDisposables,
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.panelDisposables.forEach(d => d.dispose());
      this.panelDisposables = [];
    });
  }

  // ----- Host interface -----

  send(msg: ExtensionToWebviewMessage): void {
    this.panel?.webview.postMessage(msg);
  }

  onMessage(handler: (msg: WebviewToExtensionMessage) => void): HostDisposable {
    this.messageHandlers.add(handler);
    return { dispose: () => { this.messageHandlers.delete(handler); } };
  }

  notify(level: 'info' | 'warn' | 'error', message: string): void {
    switch (level) {
      case 'info': vscode.window.showInformationMessage(message); break;
      case 'warn': vscode.window.showWarningMessage(message); break;
      case 'error': vscode.window.showErrorMessage(message); break;
    }
  }

  extensions = {
    openInEditor: async (filePath: string): Promise<void> => {
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, false);
    },
    setDistillDiagnostics: (filePath: string, suggestions: { target: string; replacement: string; reason: string; category: string }[]): void => {
      const uri = vscode.Uri.file(filePath);
      const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === filePath);
      if (!doc) {
        // No open document — clear and return; will be re-applied when opened.
        this.diagnostics.set(uri, []);
        return;
      }
      const text = doc.getText();
      const diags: vscode.Diagnostic[] = [];
      for (const s of suggestions) {
        const idx = text.indexOf(s.target);
        if (idx === -1) continue;
        const startPos = doc.positionAt(idx);
        const endPos = doc.positionAt(idx + s.target.length);
        const range = new vscode.Range(startPos, endPos);
        const diag = new vscode.Diagnostic(
          range,
          `[${s.category}] ${s.reason}`,
          vscode.DiagnosticSeverity.Warning
        );
        diag.source = this.diagSourceTag;
        diag.code = JSON.stringify({ target: s.target, replacement: s.replacement });
        diags.push(diag);
      }
      this.diagnostics.set(uri, diags);
    },
    clearDistillDiagnostics: (filePath: string): void => {
      this.diagnostics.delete(vscode.Uri.file(filePath));
    },
  };

  // ----- HTML -----

  private getPanelHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const explorerJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'explorer.js'));
    const explorerCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'explorer', 'explorer.css'));
    const resetCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'reset.css'));

    return buildExplorerHtml({
      cspMeta: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">`,
      cssLinks: `<link href="${resetCssUri}" rel="stylesheet"><link href="${explorerCssUri}" rel="stylesheet">`,
      headExtras: '',
      scriptTags: `<script nonce="${nonce}" src="${explorerJsUri}"></script>`,
    });
  }
}
