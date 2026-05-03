import * as vscode from 'vscode';
import * as fs from 'fs';
import { AdrFileSystem, FsDisposable, FsWatchEvent, ADR_GLOB_PATTERNS } from '../../core/fileSystem';

/**
 * VS Code-backed AdrFileSystem. Discovery & watching go through the
 * workspace API so we honor the user's workspace boundaries; reads/writes
 * use Node fs because the existing extension does the same and it round-trips
 * with VS Code's editor through file watchers.
 */
export class VsCodeFileSystem implements AdrFileSystem {
  async findAdrFiles(_rootDir: string): Promise<string[]> {
    const seen = new Set<string>();
    for (const pattern of ADR_GLOB_PATTERNS) {
      const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      for (const uri of uris) {
        seen.add(uri.fsPath);
      }
    }
    return Array.from(seen);
  }

  readFile(path: string): Promise<string> {
    return fs.promises.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(path);
    // Prefer applyEdit so the change goes through the editor's dirty-state
    // tracking when the file is open. Falls back to fs for unopened files.
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === path);
    if (openDoc) {
      const fullRange = new vscode.Range(openDoc.positionAt(0), openDoc.positionAt(openDoc.getText().length));
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, fullRange, content);
      await vscode.workspace.applyEdit(edit);
      await openDoc.save();
      return;
    }
    await fs.promises.writeFile(path, content, 'utf-8');
  }

  watch(_rootDir: string, onChange: (event: FsWatchEvent) => void): FsDisposable {
    const watchers: vscode.FileSystemWatcher[] = [];
    for (const pattern of ADR_GLOB_PATTERNS) {
      const w = vscode.workspace.createFileSystemWatcher(pattern);
      w.onDidCreate(uri => onChange({ kind: 'create', path: uri.fsPath }));
      w.onDidChange(uri => onChange({ kind: 'change', path: uri.fsPath }));
      w.onDidDelete(uri => onChange({ kind: 'delete', path: uri.fsPath }));
      watchers.push(w);
    }
    return { dispose: () => watchers.forEach(w => w.dispose()) };
  }
}
