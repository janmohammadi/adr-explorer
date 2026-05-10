import { AdrRecord, AdrEdge } from './types';
import { parseAdrFile } from './adrParser';
import { AdrFileSystem, FsDisposable } from './fileSystem';

type ChangeListener = () => void;

/**
 * In-memory ADR store keyed by absolute file path. Reads and watches files
 * through an `AdrFileSystem`, so it can run unchanged inside VS Code or as
 * a CLI process.
 */
export class AdrRepository {
  private adrs: Map<string, AdrRecord> = new Map();
  private listeners = new Set<ChangeListener>();
  private watcherDisposable: FsDisposable | undefined;
  private reconcileTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private fs: AdrFileSystem, private rootDir: string) {}

  async initialize(): Promise<void> {
    this.adrs.clear();
    await this.scan();
    this.setupWatcher();
  }

  /**
   * Authoritative rescan: drop in-memory entries whose files no longer exist,
   * load any new ones found on disk. Used to recover from missed watcher
   * delete events (Windows directory rename / bulk delete can coalesce them).
   */
  async reconcile(): Promise<void> {
    const paths = await this.fs.findAdrFiles(this.rootDir);
    const onDisk = new Set(paths);
    let changed = false;
    for (const key of Array.from(this.adrs.keys())) {
      if (!onDisk.has(key)) {
        this.adrs.delete(key);
        changed = true;
      }
    }
    for (const p of paths) {
      if (!this.adrs.has(p)) {
        await this.loadAdr(p);
        changed = true;
      }
    }
    if (changed) this.fire();
  }

  private scheduleReconcile(): void {
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = undefined;
      void this.reconcile();
    }, 250);
  }

  onChange(listener: ChangeListener): FsDisposable {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  }

  /**
   * Update a single ADR's in-memory record from known content (skipping the
   * disk read) and notify listeners. Used right after the inline editor
   * writes a file, so the UI reflects the change without depending on the
   * watcher's debounce — which on Windows can race with our own write.
   */
  upsertAdrFromContent(filePath: string, rawContent: string): void {
    const adr = parseAdrFile(filePath, rawContent);
    if (adr) {
      this.adrs.set(filePath, adr);
      this.fire();
    }
  }

  private fire(): void {
    for (const l of this.listeners) {
      try { l(); } catch { /* listener errors must not break the repo */ }
    }
  }

  private async scan(): Promise<void> {
    const paths = await this.fs.findAdrFiles(this.rootDir);
    for (const filePath of paths) {
      await this.loadAdr(filePath);
    }
  }

  private async loadAdr(filePath: string): Promise<void> {
    try {
      const content = await this.fs.readFile(filePath);
      const adr = parseAdrFile(filePath, content);
      if (adr) {
        this.adrs.set(filePath, adr);
      }
    } catch {
      /* skip unreadable files */
    }
  }

  private setupWatcher(): void {
    this.watcherDisposable?.dispose();
    this.watcherDisposable = this.fs.watch(this.rootDir, async (event) => {
      if (event.kind === 'delete') {
        this.adrs.delete(event.path);
      } else {
        await this.loadAdr(event.path);
      }
      this.fire();
      // Defend against missed delete events (e.g. Windows directory rename
      // coalesces per-file deletes) by reconciling against disk shortly after.
      this.scheduleReconcile();
    });
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
      for (const rel of adr.relatesTo) {
        if (allIds.has(rel.id)) {
          edges.push({ source: adr.id, target: rel.id, type: 'relates-to', reason: rel.reason });
        }
      }
    }
    return edges;
  }

  dispose(): void {
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }
    this.watcherDisposable?.dispose();
    this.listeners.clear();
  }
}
