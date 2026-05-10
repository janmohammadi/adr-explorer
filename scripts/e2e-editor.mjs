// Playwright E2E for the inline editor.
// Boots the CLI server, opens it in headed/headless Chromium, exercises
// timeline → Edit → type → Save, and asserts the file changed on disk.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve('test-fixtures');
const TARGET_FILE = path.resolve(
  'test-fixtures/adr/0001-migrate-from-web-app-to-outlook-plugins.md',
);
const PORT = 28991;
const HEADLESS = !process.argv.includes('--headed');
const MARKER = '<!-- e2e-editor-marker-' + Date.now() + ' -->';

function log(...args) { console.log('[e2e]', ...args); }
function fail(msg) { console.error('[e2e] FAIL:', msg); process.exit(1); }

async function readToken(logPath) {
  for (let i = 0; i < 40; i++) {
    try {
      const text = await fs.readFile(logPath, 'utf8');
      const m = text.match(/token=([a-f0-9]+)/);
      if (m) return m[1];
    } catch {}
    await sleep(150);
  }
  throw new Error('Could not read token from CLI log');
}

async function main() {
  // Snapshot original file so we can restore at the end.
  const original = await fs.readFile(TARGET_FILE, 'utf8');

  // Boot the CLI server. Use a child process so we can kill it cleanly.
  const logPath = path.resolve(`.e2e-cli-${PORT}.log`);
  const logFd = await fs.open(logPath, 'w');
  const cli = spawn(process.execPath, [
    'dist/cli.js',
    '--root', ROOT,
    '--no-open',
    '--port', String(PORT),
  ], { stdio: ['ignore', logFd.fd, logFd.fd], windowsHide: true });

  let exited = false;
  cli.on('exit', () => { exited = true; });

  try {
    const token = await readToken(logPath);
    log('CLI ready, token=', token.slice(0, 8) + '…');

    const url = `http://127.0.0.1:${PORT}/?token=${token}`;
    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', (msg) => {
      const t = msg.text();
      if (t.startsWith('[ADR') || t.toLowerCase().includes('error')) {
        log('console:', msg.type(), t);
      }
    });
    page.on('pageerror', (err) => log('pageerror:', err.message));

    log('navigating to', url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for at least one timeline entry to render — the WebSocket has to
    // connect and deliver the initial `update` message first.
    await page.waitForSelector('.timeline-entry', { timeout: 10000 });
    const count = await page.locator('.timeline-entry').count();
    log('timeline entries:', count);
    if (count === 0) fail('no timeline entries rendered');

    // Click ADR-0001 specifically.
    const target = page.locator('.timeline-entry[data-adr-id="ADR-0001"]');
    await target.click();
    log('selected ADR-0001');

    // Preview panel should open.
    await page.waitForSelector('#preview-panel.open', { timeout: 5000 });
    await page.waitForSelector('#preview-edit-btn', { state: 'visible' });

    // Click Edit.
    await page.click('#preview-edit-btn');
    log('clicked Edit');

    // CodeMirror editor should appear.
    await page.waitForSelector('#preview-editor .cm-editor', { timeout: 5000 });
    await page.waitForSelector('#preview-save-btn', { state: 'visible' });

    // Confirm Save button is enabled (not disabled).
    const saveDisabled = await page.locator('#preview-save-btn').evaluate((b) => b.disabled);
    log('save button disabled (initially):', saveDisabled);

    // Focus the editor area and append a marker comment to the END of the doc
    // so it stays clear of frontmatter.
    const cm = page.locator('.cm-content').first();
    await cm.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('End');
    await page.keyboard.type('\n' + MARKER + '\n');
    log('typed marker into editor');

    // Click Save.
    await page.click('#preview-save-btn');
    log('clicked Save');

    // Give the server a moment to write.
    await sleep(800);

    // Read file back and verify.
    const after = await fs.readFile(TARGET_FILE, 'utf8');
    const ok = after.includes(MARKER);
    log('file contains marker:', ok);

    if (!ok) {
      log('--- file head (first 400 bytes) ---');
      log(after.slice(0, 400));
      log('--- file tail (last 400 bytes) ---');
      log(after.slice(-400));
    }

    // Cleanup.
    await browser.close();
    if (!ok) fail('Save did not persist marker to disk.');
    log('SUCCESS — inline editor save round-trips to disk.');
  } finally {
    // Restore the file no matter what.
    await fs.writeFile(TARGET_FILE, original, 'utf8');
    if (!exited) {
      cli.kill('SIGTERM');
      // Give it a moment, then SIGKILL on Windows since SIGTERM is inconsistent.
      await sleep(300);
      try { cli.kill('SIGKILL'); } catch {}
    }
    try { await logFd.close(); } catch {}
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
