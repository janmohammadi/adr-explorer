import * as vscode from 'vscode';
import * as fs from 'fs';
import { AdrRecord, AdrEdge } from './types';
import { parseAdrFile } from './adrParser';

const ADR_PATTERNS = [
  '**/adr/*.md',
  '**/docs/adr/*.md',
  '**/docs/decisions/*.md',
  '**/docs/architecture/decisions/*.md',
];

export class AdrRepository implements vscode.Disposable {
  private adrs: Map<string, AdrRecord> = new Map();
  private watchers: vscode.FileSystemWatcher[] = [];

  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  async initialize(): Promise<void> {
    this.adrs.clear();
    await this.scanForAdrs();
    this.setupWatchers();
  }

  private async scanForAdrs(): Promise<void> {
    const seen = new Set<string>();
    for (const pattern of ADR_PATTERNS) {
      const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      for (const uri of uris) {
        if (seen.has(uri.fsPath)) { continue; }
        seen.add(uri.fsPath);
        await this.loadAdr(uri.fsPath);
      }
    }
  }

  private async loadAdr(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const adr = parseAdrFile(filePath, content);
      if (adr) {
        this.adrs.set(filePath, adr);
      }
    } catch {
      // skip unreadable files
    }
  }

  private setupWatchers(): void {
    // Dispose existing watchers before creating new ones
    this.watchers.forEach(w => w.dispose());
    this.watchers = [];

    for (const pattern of ADR_PATTERNS) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidCreate(uri => this.onFileChanged(uri));
      watcher.onDidChange(uri => this.onFileChanged(uri));
      watcher.onDidDelete(uri => this.onFileDeleted(uri));
      this.watchers.push(watcher);
    }
  }

  private async onFileChanged(uri: vscode.Uri): Promise<void> {
    await this.loadAdr(uri.fsPath);
    this._onDidChange.fire();
  }

  private onFileDeleted(uri: vscode.Uri): void {
    this.adrs.delete(uri.fsPath);
    this._onDidChange.fire();
  }

  getAllAdrs(): AdrRecord[] {
    return Array.from(this.adrs.values()).sort((a, b) => a.number - b.number);
  }

  getAdrsByStatus(status: string): AdrRecord[] {
    return this.getAllAdrs().filter(a => a.status === status);
  }

  getAllEdges(): AdrEdge[] {
    const edges: AdrEdge[] = [];
    const allIds = new Set(this.getAllAdrs().map(a => a.id));

    for (const adr of this.adrs.values()) {
      for (const target of adr.supersedes) {
        if (allIds.has(target)) {
          edges.push({ source: adr.id, target, type: 'supersedes' });
        }
      }
      for (const target of adr.amends) {
        if (allIds.has(target)) {
          edges.push({ source: adr.id, target, type: 'amends' });
        }
      }
      for (const target of adr.relatesTo) {
        if (allIds.has(target)) {
          edges.push({ source: adr.id, target, type: 'relates-to' });
        }
      }
    }
    return edges;
  }

  dispose(): void {
    this.watchers.forEach(w => w.dispose());
    this._onDidChange.dispose();
  }
}
