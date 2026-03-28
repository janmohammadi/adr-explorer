// @ts-ignore
const vscode = acquireVsCodeApi();

// ===== Helpers =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(content) {
  let html = escapeHtml(content);
  html = html.replace(/ADR-(\d{4})/g, '<span class="adr-link" data-adr-id="ADR-$1">ADR-$1</span>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^\d+\. (.*?)$/gm, '<li class="li-num">$1</li>')
    .replace(/^- (.*?)$/gm, '<li>$1</li>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<p>${html}</p>`;
}

// ===== State =====
let allAdrs = [];

// ===== Tools =====
function showToolsLoading() {
  const el = document.getElementById('ai-result');
  if (el) el.innerHTML = '<div class="loading">Thinking...</div>';
}

function showToolsResult(content) {
  const el = document.getElementById('ai-result');
  if (el) el.innerHTML = `<div class="result-content">${renderMarkdown(content)}</div>`;
}

// ===== Message Handling =====
window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'aiResult':
      showToolsResult(msg.content || '');
      break;
    case 'adrContext':
      allAdrs = msg.adrs || [];
      break;
  }
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ai-gap-analysis')?.addEventListener('click', () => { vscode.postMessage({ type: 'aiGapAnalysis' }); showToolsLoading(); });
  document.getElementById('ai-cluster-summary')?.addEventListener('click', () => { vscode.postMessage({ type: 'aiClusterSummary', adrIds: allAdrs.map(a => a.id) }); showToolsLoading(); });
  document.getElementById('ai-stakeholder-brief')?.addEventListener('click', () => { vscode.postMessage({ type: 'aiStakeholderBrief', adrIds: allAdrs.length > 0 ? [allAdrs[0].id] : [] }); showToolsLoading(); });

  vscode.postMessage({ type: 'ready' });
});
