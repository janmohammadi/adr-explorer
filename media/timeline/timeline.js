// @ts-ignore
const vscode = acquireVsCodeApi();

function renderTimeline(adrs, edges) {
  const container = document.getElementById('timeline');
  const countEl = document.getElementById('count');

  if (!adrs || adrs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>No ADRs found</h2>
        <p>Create markdown files with YAML frontmatter in an <code>adr/</code> directory.</p>
      </div>
    `;
    countEl.textContent = '0 decisions';
    return;
  }

  // Sort by date descending (newest first)
  const sorted = [...adrs].sort((a, b) => b.date.localeCompare(a.date));
  countEl.textContent = `${sorted.length} decision${sorted.length !== 1 ? 's' : ''}`;

  // Build relationship lookup (what references each ADR)
  const incomingRels = {};
  for (const edge of edges) {
    if (!incomingRels[edge.target]) { incomingRels[edge.target] = []; }
    incomingRels[edge.target].push({ type: edge.type, from: edge.source });
  }

  container.innerHTML = sorted.map(adr => {
    const outgoing = [];
    for (const id of adr.supersedes) {
      outgoing.push({ type: 'supersedes', target: id });
    }
    for (const id of adr.amends) {
      outgoing.push({ type: 'amends', target: id });
    }
    for (const id of adr.relatesTo) {
      outgoing.push({ type: 'relates to', target: id });
    }

    const incoming = incomingRels[adr.id] || [];

    const relationsHtml = [...outgoing, ...incoming.map(r => ({
      type: r.type === 'supersedes' ? 'superseded by' :
            r.type === 'amends' ? 'amended by' :
            'related from',
      target: r.from
    }))].map(r =>
      `<span class="relation">
        <span class="relation-type">${r.type}</span>
        <span class="relation-target">${r.target}</span>
      </span>`
    ).join('');

    const tagsHtml = adr.tags.map(t => `<span class="tag">${t}</span>`).join('');

    return `
      <div class="timeline-item ${adr.status}" data-filepath="${adr.filePath}">
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div class="card-header">
            <span class="adr-id">${adr.id}</span>
            <span class="adr-date">${adr.date}</span>
          </div>
          <div class="card-title">${escapeHtml(adr.title)}</div>
          <div class="card-meta">
            <span class="status-badge ${adr.status}">${adr.status}</span>
            ${tagsHtml}
          </div>
          ${relationsHtml ? `<div class="card-relations">${relationsHtml}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.timeline-item').forEach(item => {
    item.addEventListener('click', () => {
      const filePath = item.getAttribute('data-filepath');
      if (filePath) {
        vscode.postMessage({ type: 'openFile', filePath });
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      renderTimeline(msg.adrs, msg.edges);
    }
  });

  vscode.postMessage({ type: 'ready' });
});
