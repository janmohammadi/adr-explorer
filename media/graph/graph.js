const cytoscape = require('cytoscape');
const cytoscapeDagre = require('cytoscape-dagre');

cytoscape.use(cytoscapeDagre);

// @ts-ignore
const vscode = acquireVsCodeApi();

const COLORS = {
  bg: '#1e1e2e',
  accepted:   { bg: '#1e3a5f', border: '#3b82f6', text: '#93c5fd' },
  proposed:   { bg: '#3d2e08', border: '#f59e0b', text: '#fcd34d' },
  deprecated: { bg: '#2d2d2d', border: '#6b7280', text: '#9ca3af' },
  superseded: { bg: '#3b1c1c', border: '#b91c1c', text: '#fca5a5' },
  edge: {
    'supersedes': '#f97316',
    'amends':     '#3b82f6',
    'relates-to': '#6b7280',
  }
};

let cy;
let currentLayout = 'dagre';

function initGraph(container) {
  cy = cytoscape({
    container,
    style: [
      {
        selector: 'node',
        style: {
          'shape': 'round-rectangle',
          'width': 220,
          'height': 75,
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',
          'text-max-width': '195px',
          'font-size': '11px',
          'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          'background-color': 'data(bgColor)',
          'border-width': 2,
          'border-color': 'data(borderColor)',
          'color': 'data(textColor)',
          'text-outline-width': 0,
          'padding': '10px',
        }
      },
      {
        selector: 'node:active',
        style: { 'overlay-opacity': 0.08 }
      },
      {
        selector: 'node.hover',
        style: {
          'border-width': 3,
          'z-index': 10,
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-style': 'dashed',
          'line-dash-pattern': [6, 4],
          'line-color': 'data(edgeColor)',
          'target-arrow-color': 'data(edgeColor)',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'curve-style': 'bezier',
          'label': 'data(edgeLabel)',
          'font-size': '9px',
          'color': '#6b6b8a',
          'text-rotation': 'autorotate',
          'text-background-color': '#1e1e2e',
          'text-background-opacity': 1,
          'text-background-padding': '3px',
        }
      },
      {
        selector: 'edge[edgeType = "supersedes"]',
        style: {
          'line-style': 'solid',
          'width': 2,
        }
      },
      {
        selector: 'edge[edgeType = "amends"]',
        style: {
          'line-dash-pattern': [8, 3],
        }
      },
    ],
    layout: { name: 'preset' },
    minZoom: 0.2,
    maxZoom: 3,
  });

  // Tooltip on hover
  const tooltip = document.getElementById('tooltip');

  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target;
    node.addClass('hover');
    const data = node.data();
    tooltip.classList.remove('hidden');
    tooltip.innerHTML = `
      <div class="tooltip-id">${data.id}</div>
      <div class="tooltip-title">${data.title}</div>
      <div class="tooltip-meta">
        <span class="tooltip-status ${data.status}">${data.status}</span>
        <span>${data.date}</span>
      </div>
      ${data.tags && data.tags.length ? `<div class="tooltip-meta" style="margin-top:4px">${data.tags.join(', ')}</div>` : ''}
    `;
  });

  cy.on('mousemove', 'node', (evt) => {
    const tooltip = document.getElementById('tooltip');
    const pos = evt.renderedPosition;
    tooltip.style.left = (pos.x + 15) + 'px';
    tooltip.style.top = (pos.y + 15) + 'px';
  });

  cy.on('mouseout', 'node', (evt) => {
    evt.target.removeClass('hover');
    tooltip.classList.add('hidden');
  });

  // Click node to open file
  cy.on('tap', 'node', (evt) => {
    const filePath = evt.target.data('filePath');
    if (filePath) {
      vscode.postMessage({ type: 'openFile', filePath });
    }
  });
}

function runLayout(name) {
  currentLayout = name;
  const options = name === 'dagre'
    ? { name: 'dagre', rankDir: 'TB', nodeSep: 70, rankSep: 90, animate: true, animationDuration: 300 }
    : { name: 'cose', animate: true, animationDuration: 500, nodeRepulsion: () => 8000, idealEdgeLength: () => 150 };
  cy.layout(options).run();

  // Update toolbar button states
  document.querySelectorAll('#toolbar button[data-layout]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-layout') === name);
  });
}

function updateGraph(adrs, edges) {
  const elements = [];

  for (const adr of adrs) {
    const colors = COLORS[adr.status] || COLORS.proposed;
    elements.push({
      group: 'nodes',
      data: {
        id: adr.id,
        label: `${adr.id}\n${adr.title}`,
        title: adr.title,
        filePath: adr.filePath,
        status: adr.status,
        date: adr.date,
        tags: adr.tags,
        bgColor: colors.bg,
        borderColor: colors.border,
        textColor: colors.text,
      }
    });
  }

  for (const edge of edges) {
    elements.push({
      group: 'edges',
      data: {
        id: `${edge.source}-${edge.type}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        edgeType: edge.type,
        edgeLabel: edge.type,
        edgeColor: COLORS.edge[edge.type] || '#888',
      }
    });
  }

  cy.elements().remove();
  cy.add(elements);
  runLayout(currentLayout);
  setTimeout(() => cy.fit(undefined, 50), 350);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  document.body.style.backgroundColor = COLORS.bg;
  initGraph(document.getElementById('cy'));

  document.getElementById('btn-fit').addEventListener('click', () => {
    cy.animate({ fit: { padding: 50 }, duration: 300 });
  });
  document.getElementById('btn-dagre').addEventListener('click', () => runLayout('dagre'));
  document.getElementById('btn-cose').addEventListener('click', () => runLayout('cose'));

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      updateGraph(msg.adrs, msg.edges);
    } else if (msg.type === 'focusNode') {
      const node = cy.getElementById(msg.adrId);
      if (node.length) {
        cy.animate({ center: { eles: node }, zoom: 1.5, duration: 300 });
      }
    }
  });

  vscode.postMessage({ type: 'ready' });
});
