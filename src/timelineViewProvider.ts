import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { getNonce } from './utils';

export class TimelineViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private extensionUri: vscode.Uri,
    private repository: AdrRepository
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'adrExplorer.timelineView',
      'ADR Timeline',
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

    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.iconPath = new vscode.ThemeIcon('timeline-open');

    this.panel.webview.onDidReceiveMessage(
      msg => this.handleMessage(msg),
      undefined,
      this.disposables
    );

    const changeListener = this.repository.onDidChange(() => this.sendData());
    this.disposables.push(changeListener);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.disposables.forEach(d => d.dispose());
      this.disposables = [];
    });
  }

  private handleMessage(msg: { type: string; filePath?: string }): void {
    switch (msg.type) {
      case 'openFile':
        if (msg.filePath) {
          vscode.workspace.openTextDocument(msg.filePath).then(doc =>
            vscode.window.showTextDocument(doc)
          );
        }
        break;
      case 'requestData':
      case 'ready':
        this.sendData();
        break;
    }
  }

  private sendData(): void {
    this.panel?.webview.postMessage({
      type: 'update',
      adrs: this.repository.getAllAdrs(),
      edges: this.repository.getAllEdges(),
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const timelineJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'timeline.js')
    );
    const timelineCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'timeline', 'timeline.css')
    );
    const resetCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'reset.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${resetCssUri}" rel="stylesheet">
  <link href="${timelineCssUri}" rel="stylesheet">
  <title>ADR Timeline</title>
</head>
<body>
  <div id="toolbar">
    <span class="label">Timeline</span>
    <span id="count" class="count"></span>
  </div>
  <div id="timeline"></div>
  <script nonce="${nonce}" src="${timelineJsUri}"></script>
</body>
</html>`;
  }
}
