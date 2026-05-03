const esbuild = require('esbuild');
const { resolve } = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const commonOptions = {
    bundle: true,
    minify: production,
    sourcemap: !production,
  };

  // Extension host bundle (Node.js, VS Code).
  const extensionCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/adapters/vscode/extension.ts')],
    outfile: resolve(__dirname, 'dist/extension.js'),
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  });

  // Webview bundle (Browser, IIFE). Used by both VS Code and the CLI server.
  const explorerCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'media/explorer/explorer.js')],
    outfile: resolve(__dirname, 'dist/explorer.js'),
    platform: 'browser',
    format: 'iife',
  });

  // Host shim for the CLI lane (Browser, IIFE). Sets window.__adrHost via WS.
  const hostShimCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'media/explorer/host-shim.js')],
    outfile: resolve(__dirname, 'dist/host-shim.js'),
    platform: 'browser',
    format: 'iife',
  });

  // CLI bundle (Node.js).
  const cliCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/cli/index.ts')],
    outfile: resolve(__dirname, 'dist/cli.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    // Don't drag VS Code or any optional native deps into the CLI bundle.
    external: ['vscode', 'fsevents'],
    banner: { js: '#!/usr/bin/env node' },
  });

  const ctxs = [extensionCtx, explorerCtx, hostShimCtx, cliCtx];

  if (watch) {
    await Promise.all(ctxs.map(c => c.watch()));
    console.log('Watching for changes...');
  } else {
    await Promise.all(ctxs.map(c => c.rebuild()));
    await Promise.all(ctxs.map(c => c.dispose()));
    console.log('Build complete.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
