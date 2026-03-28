import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { analyzeHealth } from './healthAnalyzer';
import { detectTensions } from './conflictDetector';
import { computeLifecycleMetrics } from './lifecycleAnalyzer';
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

  private handleMessage(msg: { type: string; filePath?: string; content?: string }): void {
    switch (msg.type) {
      case 'openFile':
        if (msg.filePath) {
          vscode.workspace.openTextDocument(msg.filePath).then(doc =>
            vscode.window.showTextDocument(doc)
          );
        }
        break;
      case 'saveDraft':
        if (msg.content) {
          this.saveDraftAdr(msg.content);
        }
        break;
      case 'openAiPanel':
        vscode.commands.executeCommand('adrExplorer.openAi');
        break;
      case 'requestData':
      case 'ready':
        this.sendData();
        break;
    }
  }

  private async saveDraftAdr(content: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    // Find next ADR number
    const adrs = this.repository.getAllAdrs();
    const maxNum = adrs.reduce((max, a) => Math.max(max, a.number), 0);
    const nextNum = String(maxNum + 1).padStart(4, '0');
    const fileName = `${nextNum}-draft-what-if.md`;

    // Try to find an existing ADR directory
    const adrDirs = ['docs/adr', 'docs/decisions', 'docs/architecture/decisions', 'adr'];
    let targetDir: vscode.Uri | null = null;
    for (const dir of adrDirs) {
      const dirUri = vscode.Uri.joinPath(folders[0].uri, dir);
      try {
        await vscode.workspace.fs.stat(dirUri);
        targetDir = dirUri;
        break;
      } catch {
        // directory doesn't exist
      }
    }

    if (!targetDir) {
      targetDir = vscode.Uri.joinPath(folders[0].uri, 'docs', 'adr');
      await vscode.workspace.fs.createDirectory(targetDir);
    }

    const fileUri = vscode.Uri.joinPath(targetDir, fileName);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
  }

  sendData(): void {
    const adrs = this.repository.getAllAdrs();
    const edges = this.repository.getAllEdges();
    const health = analyzeHealth(adrs, edges);
    const tensions = detectTensions(adrs, edges);
    const lifecycle = computeLifecycleMetrics(adrs, edges);
    this.panel?.webview.postMessage({
      type: 'update',
      adrs,
      edges,
      health,
      tensions,
      lifecycle,
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
        <button id="ai-toggle" class="header-btn" title="AI Assistant">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
          </svg>
          AI
        </button>
        <button id="whatif-toggle" class="header-btn" title="What-If Scenario">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
          </svg>
          What If
        </button>
        <button id="analytics-toggle" class="header-btn" title="Toggle Analytics">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
          Analytics
        </button>
        <span id="record-count" class="header-count"></span>
      </div>
    </div>

    <!-- Health Dashboard -->
    <div id="health-dashboard" class="health-dashboard collapsed">
      <div class="health-header" id="health-header-toggle">
        <div class="health-header-left">
          <div class="health-grade-badge" id="health-grade">—</div>
          <span class="health-title">Decision Health</span>
          <span class="health-score" id="health-score"></span>
        </div>
        <div class="health-header-right">
          <span class="health-issue-count" id="health-issue-count"></span>
          <svg class="health-chevron" id="health-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>
      <div class="health-body" id="health-body">
        <div class="health-stats" id="health-stats"></div>
        <div class="health-issues" id="health-issues"></div>
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
            <button id="graph-tensions-toggle" class="graph-toolbar-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
              </svg>
              Tensions
              <span id="graph-tensions-count" class="graph-toolbar-badge" style="display:none"></span>
            </button>
            <button id="graph-group-toggle" class="graph-toolbar-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
              </svg>
              Group
              <span id="graph-group-count" class="graph-toolbar-badge" style="display:none"></span>
            </button>
          </div>
          <div id="impact-radius-control" class="impact-radius-control" style="display:none">
            <label class="impact-radius-label">Impact depth</label>
            <input id="impact-radius-slider" type="range" min="1" max="5" value="2" class="impact-radius-slider">
            <span id="impact-radius-value" class="impact-radius-value">2</span>
          </div>
          <div id="graph-tensions-list" class="graph-toolbar-list tensions-list"></div>
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
  <!-- What-If Modal -->
  <div id="whatif-modal" class="whatif-modal" style="display:none">
    <div class="whatif-modal-content">
      <div class="whatif-modal-header">
        <span class="whatif-modal-title">What-If Scenario</span>
        <button id="whatif-close" class="preview-close" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>
      <div class="whatif-modal-body">
        <div class="whatif-field">
          <label class="whatif-label">Title</label>
          <input id="whatif-title" type="text" class="whatif-input" placeholder="New decision title..." />
        </div>
        <div class="whatif-field">
          <label class="whatif-label">Status</label>
          <select id="whatif-status" class="whatif-select">
            <option value="proposed">Proposed</option>
            <option value="accepted">Accepted</option>
          </select>
        </div>
        <div class="whatif-field">
          <label class="whatif-label">Tags (comma-separated)</label>
          <input id="whatif-tags" type="text" class="whatif-input" placeholder="e.g. security, auth" />
        </div>
        <div class="whatif-field">
          <label class="whatif-label">Supersedes (ADR IDs, comma-separated)</label>
          <input id="whatif-supersedes" type="text" class="whatif-input" placeholder="e.g. ADR-0003, ADR-0007" />
        </div>
        <div class="whatif-field">
          <label class="whatif-label">Relates to (ADR IDs, comma-separated)</label>
          <input id="whatif-relates" type="text" class="whatif-input" placeholder="e.g. ADR-0001" />
        </div>
      </div>
      <div class="whatif-modal-footer">
        <button id="whatif-apply" class="whatif-btn whatif-btn-primary">Apply to Graph</button>
        <button id="whatif-discard" class="whatif-btn">Discard</button>
        <button id="whatif-save" class="whatif-btn whatif-btn-save" style="display:none">Save as Draft</button>
      </div>
    </div>
  </div>

  <!-- Analytics Overlay -->
  <div id="analytics-panel" class="analytics-panel" style="display:none">
    <div class="analytics-header">
      <span class="analytics-title">Decision Lifecycle Analytics</span>
      <button id="analytics-close" class="preview-close" title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    </div>
    <div class="analytics-body">
      <div class="analytics-section">
        <div class="analytics-section-title">Decision Velocity</div>
        <div id="velocity-chart" class="analytics-chart"></div>
      </div>
      <div class="analytics-section">
        <div class="analytics-section-title">Lifecycle Funnel</div>
        <div id="funnel-chart" class="analytics-funnel"></div>
      </div>
      <div class="analytics-section">
        <div class="analytics-section-title">Tag Stability</div>
        <div id="stability-chart" class="analytics-stability"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${explorerJsUri}"></script>
</body>
</html>`;
  }
}
