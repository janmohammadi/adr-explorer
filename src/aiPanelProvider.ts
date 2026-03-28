import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import * as ai from './aiAssistant';
import { getNonce } from './utils';

export class AiPanelProvider {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];

  constructor(
    private extensionUri: vscode.Uri,
    private repository: AdrRepository,
  ) {}

  showPanel(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'adrExplorer.aiPanel',
      'ADR AI Tools',
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
    this.panel.iconPath = new vscode.ThemeIcon('robot');

    this.panel.webview.onDidReceiveMessage(
      msg => this.handleMessage(msg),
      undefined,
      this.panelDisposables
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.panelDisposables.forEach(d => d.dispose());
      this.panelDisposables = [];
    });
  }

  private handleMessage(msg: { type: string; content?: string; adrIds?: string[] }): void {
    switch (msg.type) {
      case 'aiClusterSummary':
        this.handleAiClusterSummary(msg.adrIds || []);
        break;
      case 'aiGapAnalysis':
        this.handleAiGapAnalysis();
        break;
      case 'aiStakeholderBrief':
        this.handleAiStakeholderBrief(msg.adrIds?.[0]);
        break;
      case 'ready':
        this.sendAdrContext();
        break;
    }
  }

  private sendAdrContext(): void {
    const adrs = this.repository.getAllAdrs();
    this.panel?.webview.postMessage({ type: 'adrContext', adrs });
  }

  // ===== AI Tools =====

  private async handleAiClusterSummary(adrIds: string[]): Promise<void> {
    const adrs = this.repository.getAllAdrs().filter(a => adrIds.includes(a.id));
    if (adrs.length < 2) { this.sendAiResult('Select 2 or more ADRs for cluster summary.'); return; }
    this.sendAiResult('Generating cluster summary...');
    this.sendAiResult(await ai.generateClusterSummary(adrs));
  }

  private async handleAiGapAnalysis(): Promise<void> {
    this.sendAiResult('Analyzing gaps...');
    this.sendAiResult(await ai.generateGapAnalysis(this.repository.getAllAdrs()));
  }

  private async handleAiStakeholderBrief(adrId?: string): Promise<void> {
    if (!adrId) { this.sendAiResult('Select an ADR to generate a stakeholder brief.'); return; }
    const adr = this.repository.getAllAdrs().find(a => a.id === adrId);
    if (!adr) { this.sendAiResult('ADR not found.'); return; }
    this.sendAiResult('Generating stakeholder brief...');
    this.sendAiResult(await ai.generateStakeholderBrief(adr));
  }

  private sendAiResult(content: string): void {
    this.panel?.webview.postMessage({ type: 'aiResult', content });
  }

  // ===== HTML Template =====

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'ai-panel.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'ai-panel', 'ai-panel.css'));
    const resetCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'reset.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${resetCssUri}" rel="stylesheet">
  <link href="${cssUri}" rel="stylesheet">
  <title>ADR AI Tools</title>
</head>
<body>
  <div class="ai-app">
    <div class="ai-header">
      <div class="ai-header-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
        </svg>
        <span class="ai-header-title">ADR AI Tools</span>
      </div>
    </div>

    <div id="ai-tools-view" class="ai-view">
      <div class="tools-grid">
        <button class="tool-card" id="ai-gap-analysis">
          <div class="tool-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h5"/><path d="M17 12h5"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <div class="tool-card-text">
            <span class="tool-card-title">Analyze Gaps</span>
            <span class="tool-card-desc">Find missing architectural decisions</span>
          </div>
        </button>
        <button class="tool-card" id="ai-cluster-summary">
          <div class="tool-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-6"/><path d="M21 3 3 21"/></svg>
          </div>
          <div class="tool-card-text">
            <span class="tool-card-title">Cluster Summary</span>
            <span class="tool-card-desc">Summarize how ADRs relate</span>
          </div>
        </button>
        <button class="tool-card" id="ai-stakeholder-brief">
          <div class="tool-card-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
          </div>
          <div class="tool-card-text">
            <span class="tool-card-title">Stakeholder Brief</span>
            <span class="tool-card-desc">Non-technical summary of selected ADR</span>
          </div>
        </button>
      </div>
      <div class="tools-result-container">
        <div id="ai-result" class="ai-result"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
