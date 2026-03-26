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

  // Graph webview bundle (Browser)
  const graphCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'media/graph/graph.js')],
    outfile: resolve(__dirname, 'dist/graph.js'),
    platform: 'browser',
    format: 'iife',
  });

  // Timeline webview bundle (Browser)
  const timelineCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'media/timeline/timeline.js')],
    outfile: resolve(__dirname, 'dist/timeline.js'),
    platform: 'browser',
    format: 'iife',
  });

  // Explorer combined webview bundle (Browser)
  const explorerCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'media/explorer/explorer.js')],
    outfile: resolve(__dirname, 'dist/explorer.js'),
    platform: 'browser',
    format: 'iife',
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), graphCtx.watch(), timelineCtx.watch(), explorerCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([extensionCtx.rebuild(), graphCtx.rebuild(), timelineCtx.rebuild(), explorerCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), graphCtx.dispose(), timelineCtx.dispose(), explorerCtx.dispose()]);
    console.log('Build complete.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
