export interface FsWatchEvent {
  kind: 'create' | 'change' | 'delete';
  path: string;
}

export interface FsDisposable {
  dispose(): void;
}

/**
 * Host-neutral file system abstraction sized to what the ADR repository
 * actually needs. Implementations:
 *  - VsCodeFileSystem: wraps vscode.workspace.{findFiles,createFileSystemWatcher,fs}.
 *  - NodeFileSystem: chokidar + fast-glob + fs.promises.
 */
export interface AdrFileSystem {
  /** Glob-search for ADR markdown files under `rootDir`. Returns absolute paths. */
  findAdrFiles(rootDir: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  /** Subscribe to create/change/delete events for ADR markdown files under `rootDir`. */
  watch(rootDir: string, onChange: (event: FsWatchEvent) => void): FsDisposable;
}

/** Standard ADR locations. Both adapters use this list. */
export const ADR_GLOB_PATTERNS = [
  '**/adr/*.md',
  '**/docs/adr/*.md',
  '**/docs/decisions/*.md',
  '**/docs/architecture/decisions/*.md',
];

export const ADR_IGNORE_PATTERNS = ['**/node_modules/**'];
