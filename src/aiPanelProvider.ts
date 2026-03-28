import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import * as ai from './aiAssistant';
import { getNonce } from './utils';

export class AiPanelProvider {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private draftSession: ai.DraftSession | null = null;

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
      'ADR AI Assistant',
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

  private handleMessage(msg: { type: string; content?: string; adrIds?: string[]; description?: string; message?: string; decision?: string; answers?: string; action?: string }): void {
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
      case 'aiDraftStart':
        this.handleDraftStart(msg.description || '');
        break;
      case 'aiDraftChat':
        this.handleDraftChat(msg.message || '');
        break;
      case 'aiDraftAdvance':
        this.handleDraftAdvance(msg.message || '', msg.answers || '');
        break;
      case 'aiDraftAction':
        this.handleDraftAction(msg.action || '');
        break;
      case 'aiDraftDecide':
        this.handleDraftDecide(msg.decision || '');
        break;
      case 'aiDraftGenerate':
        this.handleDraftGenerate();
        break;
      case 'aiDraftSave':
        if (msg.content) this.saveDraftAdr(msg.content);
        break;
      case 'ready':
        // Send existing ADR data for context
        this.sendAdrContext();
        break;
    }
  }

  private sendAdrContext(): void {
    const adrs = this.repository.getAllAdrs();
    this.panel?.webview.postMessage({ type: 'adrContext', adrs });
  }

  // ===== Quick Tools =====

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

  // ===== Draft Session =====

  private async handleDraftStart(description: string): Promise<void> {
    if (!description.trim()) {
      this.sendDraftMessages([{ kind: 'text', content: 'Please describe what decision you\'re thinking about.' }]);
      return;
    }
    const adrs = this.repository.getAllAdrs();
    const edges = this.repository.getAllEdges();
    this.draftSession = new ai.DraftSession(adrs, edges);
    this.sendDraftPhase('describe');
    this.sendDraftLoading('Analyzing your decision context...');
    const messages = await this.draftSession.start(description);
    this.sendDraftMessages(messages);
    this.sendDraftState(this.draftSession.state);
  }

  private async handleDraftChat(message: string): Promise<void> {
    if (!this.draftSession) return;
    this.sendDraftLoading('Thinking...');
    this.sendDraftMessages(await this.draftSession.chat(message));
  }

  private async handleDraftAdvance(phase: string, answers: string): Promise<void> {
    if (!this.draftSession) return;
    this.sendDraftLoading('Analyzing...');
    let messages: ai.DraftMessage[];
    switch (phase) {
      case 'context':
        messages = await this.draftSession.advanceToContext(answers);
        this.sendDraftPhase('context');
        break;
      case 'options':
        messages = await this.draftSession.advanceToOptions();
        this.sendDraftPhase('options');
        break;
      default: return;
    }
    this.sendDraftMessages(messages);
    this.sendDraftState(this.draftSession.state);
  }

  private async handleDraftAction(action: string): Promise<void> {
    if (!this.draftSession) return;
    switch (action) {
      case 'advance-options':
        await this.handleDraftAdvance('options', '');
        break;
      case 'generate':
        await this.handleDraftGenerate();
        break;
      case 'back-options': {
        this.sendDraftPhase('options');
        const msgs = await this.draftSession.advanceToOptions();
        this.sendDraftMessages(msgs);
        break;
      }
    }
  }

  private async handleDraftDecide(decision: string): Promise<void> {
    if (!this.draftSession) return;
    this.sendDraftLoading('Evaluating your decision...');
    const messages = await this.draftSession.advanceToDecide(decision);
    this.sendDraftPhase('decide');
    this.sendDraftMessages(messages);
    this.sendDraftState(this.draftSession.state);
  }

  private async handleDraftGenerate(): Promise<void> {
    if (!this.draftSession) return;
    this.sendDraftLoading('Generating ADR...');
    const messages = await this.draftSession.advanceToReview();
    this.sendDraftPhase('review');
    this.sendDraftMessages(messages);
    this.sendDraftState(this.draftSession.state);
  }

  private async saveDraftAdr(content: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { vscode.window.showErrorMessage('No workspace folder open'); return; }

    const adrs = this.repository.getAllAdrs();
    const maxNum = adrs.reduce((max, a) => Math.max(max, a.number), 0);
    const nextNum = String(maxNum + 1).padStart(4, '0');
    const fileName = `${nextNum}-draft.md`;

    const adrDirs = ['docs/adr', 'docs/decisions', 'docs/architecture/decisions', 'adr'];
    let targetDir: vscode.Uri | null = null;
    for (const dir of adrDirs) {
      const dirUri = vscode.Uri.joinPath(folders[0].uri, dir);
      try { await vscode.workspace.fs.stat(dirUri); targetDir = dirUri; break; } catch { /* skip */ }
    }
    if (!targetDir) {
      targetDir = vscode.Uri.joinPath(folders[0].uri, 'docs', 'adr');
      await vscode.workspace.fs.createDirectory(targetDir);
    }

    const fileUri = vscode.Uri.joinPath(targetDir, fileName);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`ADR saved: ${fileName}`);
  }

  // ===== Message Senders =====

  private sendAiResult(content: string): void {
    this.panel?.webview.postMessage({ type: 'aiResult', content });
  }

  private sendDraftMessages(messages: ai.DraftMessage[]): void {
    this.panel?.webview.postMessage({ type: 'draftMessages', messages });
  }

  private sendDraftLoading(text: string): void {
    this.panel?.webview.postMessage({ type: 'draftLoading', content: text });
  }

  private sendDraftPhase(phase: string): void {
    this.panel?.webview.postMessage({ type: 'draftPhase', phase });
  }

  private sendDraftState(state: ai.DraftSessionState): void {
    this.panel?.webview.postMessage({ type: 'draftState', state });
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
  <title>ADR AI Assistant</title>
</head>
<body>
  <div class="ai-app">
    <!-- Header with mode tabs -->
    <div class="ai-header">
      <div class="ai-header-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
        </svg>
        <span class="ai-header-title">ADR AI Assistant</span>
      </div>
      <div class="ai-header-tabs">
        <button id="ai-mode-tools" class="ai-tab active">Tools</button>
        <button id="ai-mode-draft" class="ai-tab">Draft ADR</button>
      </div>
    </div>

    <!-- Tools View -->
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

    <!-- Draft View -->
    <div id="ai-draft-view" class="ai-view" style="display:none">
      <!-- Phase Progress -->
      <div class="draft-phase-bar">
        <div class="draft-phase-step active" data-phase="describe"><span class="draft-phase-dot"></span><span class="draft-phase-label">Describe</span></div>
        <div class="draft-phase-connector"></div>
        <div class="draft-phase-step" data-phase="context"><span class="draft-phase-dot"></span><span class="draft-phase-label">Context</span></div>
        <div class="draft-phase-connector"></div>
        <div class="draft-phase-step" data-phase="options"><span class="draft-phase-dot"></span><span class="draft-phase-label">Options</span></div>
        <div class="draft-phase-connector"></div>
        <div class="draft-phase-step" data-phase="decide"><span class="draft-phase-dot"></span><span class="draft-phase-label">Decide</span></div>
        <div class="draft-phase-connector"></div>
        <div class="draft-phase-step" data-phase="review"><span class="draft-phase-dot"></span><span class="draft-phase-label">Review</span></div>
      </div>

      <!-- Main content area (chat + optional draft preview) -->
      <div class="draft-main">
        <div id="draft-chat-log" class="draft-chat-log"></div>
        <div id="draft-preview" class="draft-preview" style="display:none">
          <div class="draft-preview-header">
            <span>Generated ADR</span>
            <button id="draft-save-btn" class="draft-save-btn">Save as ADR</button>
          </div>
          <textarea id="draft-preview-editor" class="draft-preview-editor"></textarea>
        </div>
      </div>

      <!-- Input bar -->
      <div class="draft-input-bar">
        <div id="draft-start-row" class="draft-input-row">
          <input id="draft-start-input" type="text" class="draft-input" placeholder="What decision are you thinking about?" />
          <button id="draft-start-btn" class="draft-send-btn">Start</button>
        </div>
        <div id="draft-chat-row" class="draft-input-row" style="display:none">
          <input id="draft-chat-input" type="text" class="draft-input" placeholder="Reply or ask a question..." />
          <button id="draft-send-btn" class="draft-send-btn">Send</button>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
