import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { getNonce } from './utils';

export class ExplorerViewProvider {
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

    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.iconPath = new vscode.ThemeIcon('layout');

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
    const explorerJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'explorer.js')
    );
    const explorerCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'explorer', 'explorer.css')
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
  <link href="${explorerCssUri}" rel="stylesheet">
  <title>ADR Explorer</title>
</head>
<body>
  <div class="app">
    <!-- Header / Tab Bar -->
    <div class="header">
      <div class="header-left">
        <div class="header-tab">
          <svg class="header-tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          <span>ADR Explorer</span>
          <svg class="header-tab-close" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </div>

        <!-- Search -->
        <div class="header-search">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input id="search-input" type="text" placeholder="Search ADRs..." />
        </div>

        <!-- Status Filter -->
        <div class="header-filter">
          <svg class="filter-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <select id="status-filter">
            <option value="ALL">ALL STATUS</option>
            <option value="proposed">PROPOSED</option>
            <option value="accepted">ACCEPTED</option>
            <option value="deprecated">DEPRECATED</option>
            <option value="superseded">SUPERSEDED</option>
          </select>
        </div>
      </div>

      <div class="header-right">
        <span id="record-count" class="header-count"></span>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main">
      <!-- Left Panel: Timeline -->
      <div class="timeline-panel grid-background">
        <div class="timeline-header">
          <div class="timeline-label">
            <div class="label-icon"><div class="label-icon-dot"></div></div>
            ADR Timeline
          </div>
          <div class="timeline-legend">
            <div class="legend-item"><div class="legend-dot proposed"></div><span>PROPOSED</span></div>
            <div class="legend-item"><div class="legend-dot accepted"></div><span>ACCEPTED</span></div>
            <div class="legend-item"><div class="legend-dot deprecated"></div><span>DEPRECATED</span></div>
            <div class="legend-item"><div class="legend-dot superseded"></div><span>SUPERSEDED</span></div>
          </div>
        </div>
        <div class="timeline-content">
          <div class="timeline-line"></div>
          <div id="timeline-entries" class="timeline-entries"></div>
        </div>
      </div>

      <!-- Right Panel: Graph -->
      <div class="graph-panel grid-background" id="graph-container">
        <div class="graph-label">
          <div class="label-icon"><div class="label-icon-dot"></div></div>
          ADR Graph
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${explorerJsUri}"></script>
</body>
</html>`;
  }
}
