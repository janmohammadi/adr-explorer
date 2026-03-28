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

  // Extension host bundle (Node.js)
  const extensionCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/extension.ts')],
    outfile: resolve(__dirname, 'dist/extension.js'),
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  });

  // Explorer combined webview bundle (Browser)
  const explorerCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'media/explorer/explorer.js')],
    outfile: resolve(__dirname, 'dist/explorer.js'),
    platform: 'browser',
    format: 'iife',
  });

  // AI Panel webview bundle (Browser)
  const aiPanelCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'media/ai-panel/ai-panel.js')],
    outfile: resolve(__dirname, 'dist/ai-panel.js'),
    platform: 'browser',
    format: 'iife',
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), explorerCtx.watch(), aiPanelCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([extensionCtx.rebuild(), explorerCtx.rebuild(), aiPanelCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), explorerCtx.dispose(), aiPanelCtx.dispose()]);
    console.log('Build complete.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
