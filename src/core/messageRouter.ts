import { AdrRepository } from './repository';
import { AdrFileSystem } from './fileSystem';
import { Host } from './host';
import { LMProvider } from './lmProvider';
import { HostCapabilities, DistillSuggestion, WebviewToExtensionMessage } from './types';
import { analyzeHealth } from './healthAnalyzer';
import { computeLifecycleMetrics } from './lifecycleAnalyzer';
import { analyzeInsights } from './analyzers/insights';
import { analyzeDistill, analyzeDistillAll, applySuggestion } from './analyzers/distill';

/**
 * Host-neutral handler for messages from the webview. Owns analysis
 * orchestration, distill caching, and apply-fix logic. The two hosts
 * (VS Code, CLI) wire this up with their respective Host/LMProvider/
 * AdrFileSystem implementations.
 */
export class MessageRouter {
  private distillCache = new Map<string, DistillSuggestion[]>();
  private inFlight: AbortController[] = [];

  constructor(
    private repo: AdrRepository,
    private host: Host,
    private fs: AdrFileSystem,
    private capabilities: HostCapabilities,
    private lm?: LMProvider,
  ) {}

  /** Wire up message handling and the repo change listener. Returns disposers. */
  attach(): { dispose: () => void } {
    const disposables: Array<{ dispose: () => void }> = [];

    disposables.push(this.host.onMessage((msg) => this.handleMessage(msg)));
    disposables.push(this.repo.onChange(() => this.sendData()));

    return {
      dispose: () => {
        for (const c of this.inFlight) c.abort();
        this.inFlight = [];
        for (const d of disposables) d.dispose();
      },
    };
  }

  sendData(): void {
    const adrs = this.repo.getAllAdrs();
    const edges = this.repo.getAllEdges();
    const health = analyzeHealth(adrs, edges);
    const lifecycle = computeLifecycleMetrics(adrs, edges);
    this.host.send({
      type: 'update',
      adrs,
      edges,
      health,
      lifecycle,
      capabilities: this.capabilities,
    });
  }

  private handleMessage(msg: WebviewToExtensionMessage): void {
    switch (msg.type) {
      case 'ready':
      case 'requestData':
        this.sendData();
        break;
      case 'openFile':
        this.openFile(msg.filePath);
        break;
      case 'analyzeInsights':
        this.runInsightAnalysis();
        break;
      case 'analyzeDistill':
        this.runDistillAnalysis(msg.adrId);
        break;
      case 'analyzeDistillAll':
        this.runDistillAll();
        break;
      case 'applyDistill':
        this.applyDistillSuggestion(msg.adrId, msg.suggestionId);
        break;
      case 'applyDistillAll':
        this.applyAllDistillSuggestions(msg.adrId);
        break;
      case 'openDistillAdr':
        this.openDistillAdr(msg.adrId);
        break;
      case 'saveAdr':
        this.saveAdr(msg.filePath, msg.content);
        break;
    }
  }

  private async saveAdr(filePath: string, content: string): Promise<void> {
    if (!this.capabilities.canEditFiles) {
      this.host.notify('warn', 'This session is read-only. Re-run without --read-only to save edits.');
      return;
    }
    try {
      await this.fs.writeFile(filePath, content);
      // Update the repo directly from the content we just wrote so the
      // 'update' message we broadcast carries the new state. Doing this
      // bypasses the file watcher's debounce/race window.
      this.repo.upsertAdrFromContent(filePath, content);
      this.host.extensions?.clearDistillDiagnostics?.(filePath);
      this.host.notify('info', 'Saved.');
    } catch (err: any) {
      this.host.notify('error', `Failed to save: ${err?.message || err}`);
    }
  }

  private async openFile(filePath: string): Promise<void> {
    if (this.host.extensions?.openInEditor) {
      try { await this.host.extensions.openInEditor(filePath); }
      catch (err: any) { this.host.notify('error', `Failed to open file: ${err?.message || err}`); }
    } else {
      this.host.notify('info', `File: ${filePath}`);
    }
  }

  private async openDistillAdr(adrId: string): Promise<void> {
    const adr = this.repo.getAllAdrs().find(a => a.id === adrId);
    if (!adr) return;

    if (this.host.extensions?.openInEditor) {
      try { await this.host.extensions.openInEditor(adr.filePath); }
      catch { /* non-fatal */ }
    }

    const cached = this.distillCache.get(adrId);
    if (cached && cached.length > 0) {
      this.host.extensions?.setDistillDiagnostics?.(adr.filePath, cached);
    } else if (!cached && this.capabilities.aiEnabled) {
      this.runDistillAnalysis(adrId);
    }
  }

  private trackAbort(): AbortController {
    const c = new AbortController();
    this.inFlight.push(c);
    return c;
  }

  private releaseAbort(c: AbortController): void {
    const i = this.inFlight.indexOf(c);
    if (i >= 0) this.inFlight.splice(i, 1);
  }

  private requireLm(featureLabel: string): LMProvider | null {
    if (!this.capabilities.aiEnabled || !this.lm) {
      this.host.notify('warn', `${featureLabel} is disabled. Restart with AI enabled to use this feature.`);
      return null;
    }
    return this.lm;
  }

  private async runDistillAnalysis(adrId: string): Promise<void> {
    const lm = this.requireLm('Distill');
    if (!lm) {
      this.host.send({ type: 'distillSuggestions', adrId, suggestions: [] });
      return;
    }

    this.host.send({ type: 'distillLoading', adrId, loading: true });
    const ctrl = this.trackAbort();
    try {
      const adr = this.repo.getAllAdrs().find(a => a.id === adrId);
      if (!adr) return;
      const suggestions = await analyzeDistill(adr, lm, ctrl.signal);
      this.distillCache.set(adrId, suggestions);
      this.host.send({ type: 'distillSuggestions', adrId, suggestions });
      this.host.extensions?.setDistillDiagnostics?.(adr.filePath, suggestions);
    } catch (err: any) {
      this.host.notify('error', `ADR distill analysis failed: ${err?.message || err}`);
      this.host.send({ type: 'distillSuggestions', adrId, suggestions: [] });
    } finally {
      this.host.send({ type: 'distillLoading', adrId, loading: false });
      this.releaseAbort(ctrl);
    }
  }

  private async runDistillAll(): Promise<void> {
    const lm = this.requireLm('Distill');
    if (!lm) {
      this.host.send({ type: 'distillAll', reports: [] });
      return;
    }

    this.host.send({ type: 'distillAllLoading', loading: true });
    const ctrl = this.trackAbort();
    try {
      const adrs = this.repo.getAllAdrs();
      const adrsMap = new Map(adrs.map(a => [a.id, a]));

      for (const adr of adrs) {
        this.host.send({ type: 'distillLoading', adrId: adr.id, loading: true });
      }

      const reports = await analyzeDistillAll(
        adrs,
        lm,
        ctrl.signal,
        (completed, total) => {
          this.host.send({ type: 'distillAllProgress', completed, total });
        },
        (report) => {
          this.distillCache.set(report.adrId, report.suggestions);
          this.host.send({ type: 'distillSuggestions', adrId: report.adrId, suggestions: report.suggestions });
          this.host.send({ type: 'distillLoading', adrId: report.adrId, loading: false });
          const adr = adrsMap.get(report.adrId);
          if (adr) {
            this.host.extensions?.setDistillDiagnostics?.(adr.filePath, report.suggestions);
          }
        }
      );

      this.host.send({ type: 'distillAll', reports });
    } catch (err: any) {
      this.host.notify('error', `ADR distill analysis failed: ${err?.message || err}`);
      this.host.send({ type: 'distillAll', reports: [] });
    } finally {
      this.host.send({ type: 'distillAllLoading', loading: false });
      this.releaseAbort(ctrl);
    }
  }

  private async applyDistillSuggestion(adrId: string, suggestionId: string): Promise<void> {
    if (!this.capabilities.canEditFiles) {
      this.host.notify('warn', 'This session is read-only. Re-run without --read-only to apply edits.');
      return;
    }

    const suggestions = this.distillCache.get(adrId);
    const suggestion = suggestions?.find(s => s.id === suggestionId);
    if (!suggestion) return;

    const adr = this.repo.getAllAdrs().find(a => a.id === adrId);
    if (!adr) return;

    try {
      const original = await this.fs.readFile(adr.filePath);
      if (!original.includes(suggestion.target)) {
        this.host.notify('warn', 'Could not find the target text — it may have already been changed.');
        return;
      }
      const updated = applySuggestion(original, suggestion);
      await this.fs.writeFile(adr.filePath, updated);

      const remaining = (suggestions ?? []).filter(s => s.id !== suggestionId);
      this.distillCache.set(adrId, remaining);
      this.host.send({ type: 'distillSuggestions', adrId, suggestions: remaining });

      this.host.extensions?.setDistillDiagnostics?.(adr.filePath, remaining);
    } catch (err: any) {
      this.host.notify('error', `Failed to apply suggestion: ${err?.message || err}`);
    }
  }

  private async applyAllDistillSuggestions(adrId: string): Promise<void> {
    if (!this.capabilities.canEditFiles) {
      this.host.notify('warn', 'This session is read-only. Re-run without --read-only to apply edits.');
      return;
    }

    const suggestions = this.distillCache.get(adrId);
    if (!suggestions || suggestions.length === 0) return;

    const adr = this.repo.getAllAdrs().find(a => a.id === adrId);
    if (!adr) return;

    try {
      let content = await this.fs.readFile(adr.filePath);

      const located = suggestions
        .map(s => ({ suggestion: s, idx: content.indexOf(s.target) }))
        .filter(s => s.idx !== -1)
        .sort((a, b) => b.idx - a.idx);

      for (const { suggestion } of located) {
        content = applySuggestion(content, suggestion);
      }

      await this.fs.writeFile(adr.filePath, content);

      this.distillCache.set(adrId, []);
      this.host.send({ type: 'distillSuggestions', adrId, suggestions: [] });
      this.host.extensions?.clearDistillDiagnostics?.(adr.filePath);
    } catch (err: any) {
      this.host.notify('error', `Failed to apply suggestions: ${err?.message || err}`);
    }
  }

  private async runInsightAnalysis(): Promise<void> {
    const lm = this.requireLm('Insights');
    if (!lm) {
      this.host.send({ type: 'insights', insights: [] });
      return;
    }

    this.host.send({ type: 'insightsLoading', loading: true });
    const ctrl = this.trackAbort();
    try {
      const adrs = this.repo.getAllAdrs();
      const edges = this.repo.getAllEdges();
      const insights = await analyzeInsights(adrs, edges, lm, ctrl.signal);
      this.host.send({ type: 'insights', insights });
    } catch (err: any) {
      this.host.notify('error', `ADR Insight analysis failed: ${err?.message || err}`);
      this.host.send({ type: 'insights', insights: [] });
    } finally {
      this.host.send({ type: 'insightsLoading', loading: false });
      this.releaseAbort(ctrl);
    }
  }
}
