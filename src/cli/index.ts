import * as path from 'path';
import * as fs from 'fs';
import { parseArgs, helpText } from './args';
import { startServer } from './server';
import { openBrowser } from './openBrowser';
import { AnthropicLmProvider } from '../adapters/node/lmProvider';

function readPackageVersion(packageRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main() {
  // Bundled cli.js lives at <packageRoot>/dist/cli.js, so the package root is
  // one level up. This holds for both `npx adr-explorer` and `node dist/cli.js`.
  const packageRoot = path.resolve(__dirname, '..');

  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err: any) {
    console.error(`adr-explorer: ${err?.message || err}`);
    console.error('Run `adr-explorer --help` for usage.');
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(helpText());
    return;
  }

  if (opts.version) {
    process.stdout.write(`${readPackageVersion(packageRoot)}\n`);
    return;
  }

  const rootDir = path.resolve(opts.rootDir);
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    console.error(`adr-explorer: --root is not a directory: ${rootDir}`);
    process.exit(2);
  }

  let lm;
  if (opts.withAi) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('adr-explorer: --with-ai requires ANTHROPIC_API_KEY in the environment.');
      console.error('Get a key at https://console.anthropic.com/, then export ANTHROPIC_API_KEY=sk-ant-... and re-run.');
      process.exit(2);
    }
    lm = new AnthropicLmProvider({ apiKey: apiKey as string });
  }

  const handle = await startServer({
    rootDir,
    port: opts.port,
    bindHost: opts.bindHost,
    withAi: opts.withAi,
    readOnly: opts.readOnly,
    lm,
    packageRoot,
  });

  console.log(`ADR Explorer running at ${handle.url}`);
  console.log(`  scanning: ${rootDir}`);
  console.log(`  AI:       ${opts.withAi ? 'enabled (Anthropic API)' : 'disabled — pass --with-ai with ANTHROPIC_API_KEY to enable'}`);
  console.log(`  edits:    ${opts.readOnly ? 'read-only' : 'enabled'}`);
  console.log('Press Ctrl+C to stop.');

  if (opts.open) {
    openBrowser(handle.url).catch(() => {
      console.warn(`Could not auto-open browser. Open ${handle.url} manually.`);
    });
  }

  const shutdown = async () => {
    console.log('\nShutting down...');
    try { await handle.close(); } catch { /* swallow */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('adr-explorer: fatal error');
  console.error(err?.stack || err);
  process.exit(1);
});
