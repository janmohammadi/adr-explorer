import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { analyzeHealth } from './healthAnalyzer';
import { analyzeInsights } from './insightAnalyzer';
import { analyzeDistill, analyzeDistillAll, applySuggestion } from './distillAnalyzer';
import { DistillSuggestion } from './types';
import { computeLifecycleMetrics } from './lifecycleAnalyzer';
import { getNonce } from './utils';

export class ExplorerViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];

  constructor(
    private extensionUri: vscode.Uri,
    private repository: AdrRepository,
    private diagnostics: vscode.DiagnosticCollection
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

  private handleMessage(msg: { type: string; filePath?: string; content?: string; adrId?: string; suggestionId?: string }): void {
    switch (msg.type) {
      case 'openFile':
        if (msg.filePath) {
          vscode.workspace.openTextDocument(msg.filePath).then(doc =>
            vscode.window.showTextDocument(doc)
          );
        }
        break;
      case 'analyzeInsights':
        this.runInsightAnalysis();
        break;
      case 'analyzeDistill':
        if (msg.adrId) {
          this.runDistillAnalysis(msg.adrId);
        }
        break;
      case 'analyzeDistillAll':
        this.runDistillAll();
        break;
      case 'applyDistill':
        if (msg.adrId && msg.suggestionId) {
          this.applyDistillSuggestion(msg.adrId, msg.suggestionId);
        }
        break;
      case 'applyDistillAll':
        if (msg.adrId) {
          this.applyAllDistillSuggestions(msg.adrId);
        }
        break;
      case 'openDistillAdr':
        if (msg.adrId) {
          this.openDistillAdr(msg.adrId);
        }
        break;
      case 'requestData':
      case 'ready':
        this.sendData();
        break;
    }
  }

  sendData(): void {
    const adrs = this.repository.getAllAdrs();
    const edges = this.repository.getAllEdges();
    const health = analyzeHealth(adrs, edges);
    const lifecycle = computeLifecycleMetrics(adrs, edges);
    this.panel?.webview.postMessage({
      type: 'update',
      adrs,
      edges,
      health,
      lifecycle,
    });
  }

  /** Distill cache: suggestions keyed by adrId for apply operations */
  private distillCache = new Map<string, DistillSuggestion[]>();

  private async openDistillAdr(adrId: string): Promise<void> {
    const adr = this.repository.getAllAdrs().find(a => a.id === adrId);
    if (!adr) return;

    // Open the file in the editor (beside the webview panel)
    const doc = await vscode.workspace.openTextDocument(adr.filePath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, false);

    // Set diagnostics if we have cached suggestions
    const suggestions = this.distillCache.get(adrId);
    if (suggestions && suggestions.length > 0) {
      this.setDistillDiagnostics(doc, suggestions);
    }

    // Auto-trigger analysis if not cached
    if (!suggestions) {
      this.runDistillAnalysis(adrId);
    }
  }

  private setDistillDiagnostics(doc: vscode.TextDocument, suggestions: DistillSuggestion[]): void {
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
      diag.source = 'adr-distill';
      // Store target + replacement so the code action can use them
      diag.code = JSON.stringify({ target: s.target, replacement: s.replacement });
      diags.push(diag);
    }

    this.diagnostics.set(doc.uri, diags);
  }

  private async runDistillAnalysis(adrId: string): Promise<void> {
    this.panel?.webview.postMessage({ type: 'distillLoading', adrId, loading: true });
    try {
      const adr = this.repository.getAllAdrs().find(a => a.id === adrId);
      if (!adr) return;
      const tokenSource = new vscode.CancellationTokenSource();
      const suggestions = await analyzeDistill(adr, tokenSource.token);
      this.distillCache.set(adrId, suggestions);
      this.panel?.webview.postMessage({ type: 'distillSuggestions', adrId, suggestions });

      // Set diagnostics on the file if it's open
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.uri.fsPath === adr.filePath) {
          this.setDistillDiagnostics(doc, suggestions);
          break;
        }
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`ADR distill analysis failed: ${err.message}`);
      this.panel?.webview.postMessage({ type: 'distillSuggestions', adrId, suggestions: [] });
    } finally {
      this.panel?.webview.postMessage({ type: 'distillLoading', adrId, loading: false });
    }
  }

  private async runDistillAll(): Promise<void> {
    this.panel?.webview.postMessage({ type: 'distillAllLoading', loading: true });
    try {
      const adrs = this.repository.getAllAdrs();
      const adrsMap = new Map(adrs.map(a => [a.id, a]));
      const tokenSource = new vscode.CancellationTokenSource();

      // Mark all ADRs as loading
      for (const adr of adrs) {
        this.panel?.webview.postMessage({ type: 'distillLoading', adrId: adr.id, loading: true });
      }

      const reports = await analyzeDistillAll(
        adrs,
        tokenSource.token,
        (completed, total) => {
          this.panel?.webview.postMessage({ type: 'distillAllProgress', completed, total });
        },
        async (report) => {
          // Stream each result to the UI as it completes
          this.distillCache.set(report.adrId, report.suggestions);
          this.panel?.webview.postMessage({ type: 'distillSuggestions', adrId: report.adrId, suggestions: report.suggestions });
          this.panel?.webview.postMessage({ type: 'distillLoading', adrId: report.adrId, loading: false });
          const adr = adrsMap.get(report.adrId);
          if (adr) {
            try {
              const doc = await vscode.workspace.openTextDocument(adr.filePath);
              this.setDistillDiagnostics(doc, report.suggestions);
            } catch { /* file may not be accessible */ }
          }
        }
      );

      this.panel?.webview.postMessage({ type: 'distillAll', reports });
    } catch (err: any) {
      vscode.window.showErrorMessage(`ADR distill analysis failed: ${err.message}`);
      this.panel?.webview.postMessage({ type: 'distillAll', reports: [] });
    } finally {
      this.panel?.webview.postMessage({ type: 'distillAllLoading', loading: false });
    }
  }

  private async applyDistillSuggestion(adrId: string, suggestionId: string): Promise<void> {
    const suggestions = this.distillCache.get(adrId);
    const suggestion = suggestions?.find(s => s.id === suggestionId);
    if (!suggestion) return;

    const adr = this.repository.getAllAdrs().find(a => a.id === adrId);
    if (!adr) return;

    try {
      const doc = await vscode.workspace.openTextDocument(adr.filePath);
      const fullText = doc.getText();
      const idx = fullText.indexOf(suggestion.target);
      if (idx === -1) {
        vscode.window.showWarningMessage('Could not find the target text — it may have already been changed.');
        return;
      }
      const startPos = doc.positionAt(idx);
      const endPos = doc.positionAt(idx + suggestion.target.length);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, new vscode.Range(startPos, endPos), suggestion.replacement);
      await vscode.workspace.applyEdit(edit);
      await doc.save();

      // Remove applied suggestion from cache and update diagnostics
      const remaining = suggestions!.filter(s => s.id !== suggestionId);
      this.distillCache.set(adrId, remaining);
      this.panel?.webview.postMessage({ type: 'distillSuggestions', adrId, suggestions: remaining });

      // Refresh diagnostics on the updated doc
      const updatedDoc = await vscode.workspace.openTextDocument(adr.filePath);
      this.setDistillDiagnostics(updatedDoc, remaining);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to apply suggestion: ${err.message}`);
    }
  }

  private async applyAllDistillSuggestions(adrId: string): Promise<void> {
    const suggestions = this.distillCache.get(adrId);
    if (!suggestions || suggestions.length === 0) return;

    const adr = this.repository.getAllAdrs().find(a => a.id === adrId);
    if (!adr) return;

    try {
      const doc = await vscode.workspace.openTextDocument(adr.filePath);
      let content = doc.getText();

      const located = suggestions
        .map(s => ({ suggestion: s, idx: content.indexOf(s.target) }))
        .filter(s => s.idx !== -1)
        .sort((a, b) => b.idx - a.idx);

      for (const { suggestion } of located) {
        content = applySuggestion(content, suggestion);
      }

      const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, fullRange, content);
      await vscode.workspace.applyEdit(edit);
      await doc.save();

      this.distillCache.set(adrId, []);
      this.panel?.webview.postMessage({ type: 'distillSuggestions', adrId, suggestions: [] });
      this.diagnostics.delete(doc.uri);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to apply suggestions: ${err.message}`);
    }
  }

  private async runInsightAnalysis(): Promise<void> {
    this.panel?.webview.postMessage({ type: 'insightsLoading', loading: true });
    try {
      const adrs = this.repository.getAllAdrs();
      const edges = this.repository.getAllEdges();
      const tokenSource = new vscode.CancellationTokenSource();
      const insights = await analyzeInsights(adrs, edges, tokenSource.token);
      this.panel?.webview.postMessage({ type: 'insights', insights });
    } catch (err: any) {
      vscode.window.showErrorMessage(`ADR Insight analysis failed: ${err.message}`);
      this.panel?.webview.postMessage({ type: 'insights', insights: [] });
    } finally {
      this.panel?.webview.postMessage({ type: 'insightsLoading', loading: false });
    }
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
        <button id="distill-toggle" class="header-btn" title="Toggle Distill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 3h6l-3 7h4l-5 8 1-5H8z"/>
          </svg>
          Distill
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
            <button id="graph-insights-toggle" class="graph-toolbar-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
                <path d="M20 3v4"/><path d="M22 5h-4"/>
              </svg>
              AI Insights
              <span id="graph-insights-count" class="graph-toolbar-badge" style="display:none"></span>
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
          <div id="graph-insights-list" class="graph-toolbar-list insights-list"></div>
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
  <!-- Distill Overlay -->
  <div id="distill-panel" class="distill-panel" style="display:none">
    <div class="distill-panel-header">
      <span class="distill-panel-title">Distill</span>
      <button id="distill-close" class="preview-close" title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    </div>
    <div class="distill-panel-body">
      <div class="distill-sidebar">
        <div class="distill-sidebar-actions">
          <button id="distill-all-btn" class="distill-all-btn">Distill All ADRs</button>
        </div>
        <div id="distill-progress" class="distill-progress" style="display:none"></div>
        <div id="distill-adr-list" class="distill-adr-list"></div>
      </div>
      <div class="distill-content">
        <div id="distill-content-header" class="distill-content-header" style="display:none">
          <div class="distill-content-title-row">
            <span id="distill-content-id" class="distill-content-id"></span>
            <span id="distill-content-title" class="distill-content-title"></span>
          </div>
          <div class="distill-content-actions">
            <span id="distill-content-count" class="distill-content-count"></span>
            <button id="distill-content-apply-all" class="distill-apply-all-btn">Apply All</button>
          </div>
        </div>
        <div id="distill-content-body" class="distill-content-body">
          <div class="distill-content-empty">Select an ADR from the list to view suggestions</div>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${explorerJsUri}"></script>
</body>
</html>`;
  }
}
