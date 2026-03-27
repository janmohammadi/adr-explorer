import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { getNonce } from './utils';

export class ExplorerViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];

  constructor(
    private extensionUri: vscode.Uri,
    private repository: AdrRepository
  ) {}

  /** Opens or reveals the full explorer in an editor tab. */
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
      msg => this.handleMessage(msg),
      undefined,
      this.panelDisposables
    );

    const changeListener = this.repository.onDidChange(() => this.sendData());
    this.panelDisposables.push(changeListener);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.panelDisposables.forEach(d => d.dispose());
      this.panelDisposables = [];
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

  sendData(): void {
    this.panel?.webview.postMessage({
      type: 'update',
      adrs: this.repository.getAllAdrs(),
      edges: this.repository.getAllEdges(),
    });
  }

  private getPanelHtml(webview: vscode.Webview): string {
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
        <!-- Search -->
        <div class="header-search">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input id="search-input" type="text" placeholder="Search ADRs..." />
        </div>

      </div>

      <div class="header-right">
        <span id="record-count" class="header-count"></span>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main">
      <!-- Left Panel: Timeline -->
      <div class="timeline-panel">
        <div class="timeline-header">
          <div class="timeline-label">
            <div class="label-icon"><div class="label-icon-dot"></div></div>
            ADR Timeline
          </div>
        </div>
        <div class="timeline-content">
          <div class="timeline-line"></div>
          <div id="timeline-entries" class="timeline-entries"></div>
        </div>
      </div>

      <!-- Resize handle: timeline | graph -->
      <div id="resize-handle-timeline" class="resize-handle"></div>

      <!-- Middle Panel: Graph -->
      <div class="graph-panel grid-background" id="graph-container">
        <div class="graph-label">
          <div class="label-icon"><div class="label-icon-dot"></div></div>
          ADR Graph
        </div>
        <div class="graph-controls">
          <div class="graph-toolbar">
            <button id="graph-filter-toggle" class="graph-toolbar-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>
              </svg>
              Filter
              <span id="graph-filter-count" class="graph-toolbar-badge" style="display:none"></span>
            </button>
            <button id="graph-group-toggle" class="graph-toolbar-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
              </svg>
              Group
              <span id="graph-group-count" class="graph-toolbar-badge" style="display:none"></span>
            </button>
          </div>
          <div id="graph-filter-tag-list" class="graph-toolbar-list"></div>
          <div id="graph-group-tag-list" class="graph-toolbar-list"></div>
        </div>
        <div id="graph-group-legend" class="graph-group-legend"></div>
      </div>

      <!-- Resize handle: graph | preview (hidden until preview opens) -->
      <div id="resize-handle-preview" class="resize-handle resize-handle-preview"></div>

      <!-- Preview Panel (slides in from right) -->
      <div class="preview-panel" id="preview-panel">
        <div class="preview-header">
          <div class="preview-header-left">
            <div class="preview-header-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
              </svg>
              <span id="preview-id" class="preview-header-id"></span>
            </div>
            <span id="preview-title" class="preview-header-title"></span>
          </div>
          <div class="preview-header-actions">
            <button id="preview-edit-btn" class="preview-btn preview-btn-primary" title="Open in editor">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
              </svg>
              Edit
            </button>
            <button id="preview-close-btn" class="preview-close" title="Close preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="preview-meta" class="preview-meta"></div>
        <div id="preview-body" class="preview-body"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${explorerJsUri}"></script>
</body>
</html>`;
  }
}
