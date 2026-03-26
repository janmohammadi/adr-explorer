import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { getNonce } from './utils';

export class GraphViewProvider {
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
      'adrExplorer.graphView',
      'ADR Graph',
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
    this.panel.iconPath = new vscode.ThemeIcon('type-hierarchy');

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
    const graphJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'graph.js')
    );
    const graphCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'graph', 'graph.css')
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
  <link href="${graphCssUri}" rel="stylesheet">
  <title>ADR Graph</title>
</head>
<body>
  <div id="toolbar">
    <span class="label">Layout</span>
    <button id="btn-dagre" data-layout="dagre" class="active" title="Hierarchical layout">Hierarchy</button>
    <button id="btn-cose" data-layout="cose" title="Force-directed layout">Force</button>
    <div class="separator"></div>
    <button id="btn-fit" title="Fit graph to viewport">Fit</button>
    <div id="legend">
      <div class="legend-item"><div class="legend-dot accepted"></div>Accepted</div>
      <div class="legend-item"><div class="legend-dot proposed"></div>Proposed</div>
      <div class="legend-item"><div class="legend-dot deprecated"></div>Deprecated</div>
      <div class="legend-item"><div class="legend-dot superseded"></div>Superseded</div>
    </div>
  </div>
  <div id="cy"></div>
  <div id="tooltip" class="hidden"></div>
  <script nonce="${nonce}" src="${graphJsUri}"></script>
</body>
</html>`;
  }
}
