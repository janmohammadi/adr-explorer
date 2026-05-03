// CLI host shim: opens a WebSocket back to the local server and exposes
// window.__adrHost with the same { postMessage } shape as VS Code's
// `acquireVsCodeApi()`. Inbound server messages are forwarded as DOM
// `message` events so the existing webview code path is unchanged.
(function () {
  'use strict';

  var bootstrap = window.__adrBootstrap || {};
  var token = bootstrap.token || '';
  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var url = protocol + '//' + window.location.host + '/ws' + (token ? '?token=' + encodeURIComponent(token) : '');

  var queue = [];
  var ws = null;
  var ready = false;

  function open() {
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error('[ADR] failed to construct WebSocket:', err);
      return;
    }

    ws.addEventListener('open', function () {
      ready = true;
      while (queue.length) {
        var pending = queue.shift();
        try { ws.send(pending); } catch (e) { console.error('[ADR] ws send failed', e); }
      }
    });

    ws.addEventListener('message', function (event) {
      var data;
      try { data = JSON.parse(event.data); } catch (e) {
        console.warn('[ADR] non-JSON ws message ignored');
        return;
      }
      // Forward to the same handler the webview uses inside VS Code.
      window.dispatchEvent(new MessageEvent('message', { data: data }));
    });

    ws.addEventListener('close', function () {
      ready = false;
      // Single retry after a short delay; if that fails the user can reload.
      setTimeout(function () {
        if (!ready) open();
      }, 1500);
    });

    ws.addEventListener('error', function () {
      // Errors precede a close; let close handle reconnect.
    });
  }

  window.__adrHost = {
    postMessage: function (msg) {
      var payload = JSON.stringify(msg);
      if (ready && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else {
        queue.push(payload);
      }
    },
    // The webview only uses postMessage today, but mirror the VS Code shape
    // so future code that calls getState/setState doesn't crash.
    getState: function () { return null; },
    setState: function () {},
  };

  open();
})();
