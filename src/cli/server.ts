import * as http from 'http';
import * as path from 'path';
import * as crypto from 'crypto';
import express = require('express');
import { WebSocketServer } from 'ws';
import { AdrRepository } from '../core/repository';
import { MessageRouter } from '../core/messageRouter';
import { LMProvider } from '../core/lmProvider';
import { NodeFileSystem } from '../adapters/node/fileSystem';
import { WebSocketHost } from '../adapters/node/host';
import { buildExplorerHtml } from '../core/explorerHtml';

export interface ServerOptions {
  rootDir: string;
  port: number;
  bindHost: string;
  withAi: boolean;
  readOnly: boolean;
  /** Set when withAi is true. The CLI is expected to construct it. */
  lm?: LMProvider;
  /** Resolved absolute path of the package root (for serving static assets). */
  packageRoot: string;
}

export interface ServerHandle {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<ServerHandle> {
  const fs = new NodeFileSystem();
  const repo = new AdrRepository(fs, opts.rootDir);
  await repo.initialize();

  const host = new WebSocketHost();
  const router = new MessageRouter(
    repo,
    host,
    fs,
    { aiEnabled: opts.withAi, canEditFiles: !opts.readOnly },
    opts.lm,
  );
  const routerAttachment = router.attach();

  const token = crypto.randomBytes(16).toString('hex');

  const app = express();

  // Token gate. Browser tabs ship the token in the query string; subsequent
  // static asset fetches must include it too. This protects the local server
  // from drive-by sites that might know the port.
  app.use((req, res, next) => {
    const provided = typeof req.query.token === 'string' ? req.query.token : '';
    // Constant-time compare to deter timing oracles even on localhost.
    const ok = provided.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token));
    if (!ok) { res.status(401).type('text').send('Unauthorized'); return; }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Static assets (the bundled webview + host shim + CSS).
  app.get('/static/explorer.js', (_req, res) => {
    res.type('application/javascript').sendFile(path.join(opts.packageRoot, 'dist', 'explorer.js'));
  });
  app.get('/static/host-shim.js', (_req, res) => {
    res.type('application/javascript').sendFile(path.join(opts.packageRoot, 'dist', 'host-shim.js'));
  });
  app.get('/static/explorer.css', (_req, res) => {
    res.type('text/css').sendFile(path.join(opts.packageRoot, 'media', 'explorer', 'explorer.css'));
  });
  app.get('/static/reset.css', (_req, res) => {
    res.type('text/css').sendFile(path.join(opts.packageRoot, 'media', 'reset.css'));
  });

  app.get('/', (_req, res) => {
    const html = buildExplorerHtml({
      // Self-host CSP. Bundles are local; no CDNs.
      cspMeta: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:;">`,
      cssLinks: `<link href="/static/reset.css?token=${token}" rel="stylesheet"><link href="/static/explorer.css?token=${token}" rel="stylesheet">`,
      // Bootstrap object exposes the WS token to host-shim.js.
      headExtras: `<script>window.__adrBootstrap = ${JSON.stringify({ token })};</script>`,
      // Host shim must run BEFORE explorer.js so window.__adrHost is set when
      // explorer.js evaluates its host detector.
      scriptTags: `<script src="/static/host-shim.js?token=${token}"></script><script src="/static/explorer.js?token=${token}"></script>`,
    });
    res.type('html').send(html);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const provided = url.searchParams.get('token') ?? '';
    const ok = provided.length === token.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token));
    if (!ok) { socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, (ws) => {
      host.attach(ws);
      // First-paint: send a snapshot immediately. The webview will also send
      // 'ready' on DOMContentLoaded which triggers another sendData, but doing
      // it here cuts a round-trip on slow connections.
      router.sendData();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.bindHost, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : opts.port;
  const url = `http://${opts.bindHost}:${actualPort}/?token=${token}`;

  return {
    url,
    port: actualPort,
    token,
    close: async () => {
      routerAttachment.dispose();
      repo.dispose();
      wss.close();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}
