import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import fastGlob = require('fast-glob');
import { AdrFileSystem, FsDisposable, FsWatchEvent, ADR_GLOB_PATTERNS, ADR_IGNORE_PATTERNS } from '../../core/fileSystem';

/**
 * Node-backed AdrFileSystem for the CLI/web target. Discovery uses fast-glob;
 * watching uses chokidar (POSIX + Windows reliable). All paths returned are
 * absolute so they round-trip through the rest of the pipeline.
 */
export class NodeFileSystem implements AdrFileSystem {
  async findAdrFiles(rootDir: string): Promise<string[]> {
    const matches = await fastGlob(ADR_GLOB_PATTERNS, {
      cwd: rootDir,
      absolute: true,
      ignore: ADR_IGNORE_PATTERNS,
      onlyFiles: true,
      dot: false,
    });
    // Normalize separators to OS-native (chokidar emits OS-native paths too).
    return matches.map(p => path.resolve(p));
  }

  readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, 'utf-8');
  }

  writeFile(filePath: string, content: string): Promise<void> {
    return fs.promises.writeFile(filePath, content, 'utf-8');
  }

  watch(rootDir: string, onChange: (event: FsWatchEvent) => void): FsDisposable {
    const watcher = chokidar.watch(ADR_GLOB_PATTERNS, {
      cwd: rootDir,
      ignored: ADR_IGNORE_PATTERNS,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    const toAbs = (p: string) => path.isAbsolute(p) ? p : path.resolve(rootDir, p);

    watcher.on('add', p => onChange({ kind: 'create', path: toAbs(p) }));
    watcher.on('change', p => onChange({ kind: 'change', path: toAbs(p) }));
    watcher.on('unlink', p => onChange({ kind: 'delete', path: toAbs(p) }));

    return { dispose: () => { watcher.close().catch(() => {}); } };
  }
}
