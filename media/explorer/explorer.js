const { select } = require('d3-selection');
const { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceRadial } = require('d3-force');
const { zoom: d3Zoom, zoomIdentity } = require('d3-zoom');
const { drag: d3Drag } = require('d3-drag');
const { Marked } = require('marked');
const mermaid = require('mermaid');

// @ts-ignore
const vscode = acquireVsCodeApi();

// ===== Constants =====
const STATUS_COLORS = {
  proposed:    '#f27d26',
  accepted:    '#3b82f6',
  deprecated:  '#6b7280',
  superseded:  '#ef4444',
};

function getStatusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.proposed;
}

const TAG_GROUP_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
  '#84cc16', '#a855f7', '#22d3ee', '#e11d48', '#facc15',
];

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ===== Markdown Setup =====
const marked = new Marked();
let mermaidId = 0;

mermaid.default.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#141517',
    primaryColor: '#3b82f6',
    primaryTextColor: '#e0e0f0',
    lineColor: '#555',
    textColor: '#c0c0d0',
    mainBkg: '#1e1e30',
    nodeBorder: '#3b82f6',
  },
});

// ===== State =====
let allAdrs = [];
let allEdges = [];
let healthReport = null;
let allInsights = [];
let insightsLoading = false;
let searchQuery = '';
let activeStatuses = new Set();
let activeTags = new Set();
let selectedAdrId = null;
let groupByTags = new Set(); // tags currently used for graph grouping

// ===== Filtering =====
function getFilteredData() {
  const query = searchQuery.toLowerCase();
  const filteredAdrs = allAdrs.filter(adr => {
    const matchesSearch = !query ||
      adr.title.toLowerCase().includes(query) ||
      adr.id.toLowerCase().includes(query) ||
      (adr.tags && adr.tags.some(t => t.toLowerCase().includes(query)));
    const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(adr.status);
    const matchesTags = activeTags.size === 0 ||
      (adr.tags && adr.tags.some(t => activeTags.has(t)));
    return matchesSearch && matchesStatus && matchesTags;
  });
  const filteredIds = new Set(filteredAdrs.map(a => a.id));
  const filteredEdges = allEdges.filter(e => filteredIds.has(e.source) && filteredIds.has(e.target));
  return { adrs: filteredAdrs, edges: filteredEdges };
}

// ===== Tag Helpers =====
function getTagCounts() {
  const tagCounts = {};
  for (const adr of allAdrs) {
    if (adr.tags) {
      for (const tag of adr.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }
  return tagCounts;
}

// ===== Impact Ripple Analysis =====
let impactRadius = 2; // default: 2-hop

function computeImpactMap(adrId, edges, maxHops) {
  const impact = new Map(); // adrId -> { depth, weight }
  if (!adrId) return impact;

  const edgeWeights = { 'supersedes': 1.0, 'amends': 0.7, 'relates-to': 0.4 };
  const adjacency = {};
  for (const edge of edges) {
    const s = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const t = typeof edge.target === 'object' ? edge.target.id : edge.target;
    if (!adjacency[s]) adjacency[s] = [];
    if (!adjacency[t]) adjacency[t] = [];
    adjacency[s].push({ neighbor: t, weight: edgeWeights[edge.type] || 0.4 });
    adjacency[t].push({ neighbor: s, weight: edgeWeights[edge.type] || 0.4 });
  }

  // BFS with depth tracking
  const queue = [{ id: adrId, depth: 0, weight: 1.0 }];
  impact.set(adrId, { depth: 0, weight: 1.0 });

  while (queue.length > 0) {
    const { id, depth, weight } = queue.shift();
    if (depth >= maxHops) continue;
    const neighbors = adjacency[id] || [];
    for (const { neighbor, weight: edgeWeight } of neighbors) {
      if (!impact.has(neighbor)) {
        const newWeight = weight * edgeWeight * 0.7; // decay
        impact.set(neighbor, { depth: depth + 1, weight: newWeight });
        queue.push({ id: neighbor, depth: depth + 1, weight: newWeight });
      }
    }
  }

  return impact;
}

function selectAdr(adrId) {
  if (selectedAdrId === adrId) {
    selectedAdrId = null;
    Preview.close();
  } else {
    selectedAdrId = adrId;
    const adr = allAdrs.find(a => a.id === adrId);
    if (adr) {
      Preview.show(adr);
    }
  }
  Timeline.updateSelection(selectedAdrId);
  Graph._selectedNodeId = selectedAdrId;
  Graph.updateStyles();

  // Show/hide impact radius control
  const impactControl = document.getElementById('impact-radius-control');
  if (impactControl) {
    impactControl.style.display = selectedAdrId ? 'flex' : 'none';
  }
}

// ===== Preview Module =====
const Preview = {
  async show(adr) {
    const panel = document.getElementById('preview-panel');
    const idEl = document.getElementById('preview-id');
    const titleEl = document.getElementById('preview-title');
    const metaEl = document.getElementById('preview-meta');
    const bodyEl = document.getElementById('preview-body');
    const editBtn = document.getElementById('preview-edit-btn');

    if (!panel || !bodyEl) return;

    // Header info
    if (idEl) idEl.textContent = adr.id;
    if (titleEl) titleEl.textContent = adr.title;

    // Meta info
    if (metaEl) {
      const statusDot = `<span class="preview-status-dot" style="background:${getStatusColor(adr.status)}"></span>`;
      const tagsHtml = (adr.tags || []).map(t =>
        `<span class="preview-tag">${escapeHtml(t)}</span>`
      ).join(' ');

      metaEl.innerHTML = `
        <div class="preview-meta-item">
          ${statusDot}
          <span class="preview-meta-value" style="text-transform:uppercase">${escapeHtml(adr.status)}</span>
        </div>
        <div class="preview-meta-item">
          <span class="preview-meta-label">date:</span>
          <span class="preview-meta-value">${escapeHtml(adr.date)}</span>
        </div>
        ${adr.deciders && adr.deciders.length ? `
          <div class="preview-meta-item">
            <span class="preview-meta-label">deciders:</span>
            <span class="preview-meta-value">${escapeHtml(adr.deciders.join(', '))}</span>
          </div>
        ` : ''}
        ${tagsHtml ? `<div class="preview-meta-item">${tagsHtml}</div>` : ''}
        ${adr.reviewBy ? `
          <div class="preview-meta-item">
            <span class="preview-meta-label">review by:</span>
            <span class="preview-meta-value ${adr.reviewStatus === 'overdue' ? 'meta-overdue' : adr.reviewStatus === 'due-soon' ? 'meta-due-soon' : ''}">${escapeHtml(adr.reviewBy)}</span>
          </div>
        ` : ''}
        ${adr.expires ? `
          <div class="preview-meta-item">
            <span class="preview-meta-label">expires:</span>
            <span class="preview-meta-value ${adr.reviewStatus === 'expired' ? 'meta-expired' : ''}">${escapeHtml(adr.expires)}</span>
          </div>
        ` : ''}
        ${adr.confidence ? `
          <div class="preview-meta-item">
            <span class="preview-meta-label">confidence:</span>
            <span class="preview-meta-value conf-${adr.confidence}">${escapeHtml(adr.confidence)}</span>
          </div>
        ` : ''}
      `;
    }

    // Edit button
    if (editBtn) {
      editBtn.onclick = () => {
        if (adr.filePath) {
          vscode.postMessage({ type: 'openFile', filePath: adr.filePath });
        }
      };
    }

    // Render markdown content
    const content = adr.content || '';
    let html = await marked.parse(content);

    // Replace mermaid code blocks with rendered containers
    // marked wraps ```mermaid blocks in <pre><code class="language-mermaid">
    bodyEl.innerHTML = html;

    // Find mermaid code blocks and render them
    const mermaidBlocks = bodyEl.querySelectorAll('code.language-mermaid');
    for (const block of mermaidBlocks) {
      const pre = block.parentElement;
      if (!pre || pre.tagName !== 'PRE') continue;
      const mermaidCode = block.textContent || '';
      const containerId = `mermaid-${++mermaidId}`;
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.id = containerId;
      try {
        const { svg } = await mermaid.default.render(containerId, mermaidCode);
        div.innerHTML = svg;
      } catch (e) {
        div.innerHTML = `<pre style="color:#ef4444;font-size:11px">Mermaid render error: ${escapeHtml(String(e))}</pre>`;
      }
      pre.replaceWith(div);
    }

    // Open panel + show its resize handle
    panel.classList.add('open');
    const handle = document.getElementById('resize-handle-preview');
    if (handle) handle.classList.add('visible');
  },

  close() {
    const panel = document.getElementById('preview-panel');
    if (panel) {
      panel.classList.remove('open');
      panel.style.width = '';
    }
    const handle = document.getElementById('resize-handle-preview');
    if (handle) handle.classList.remove('visible');
  }
};

// ===== Timeline Module =====
const Timeline = {
  render(adrs) {
    const container = document.getElementById('timeline-entries');
    if (!container) return;

    if (adrs.length === 0) {
      container.innerHTML = '<div class="timeline-empty">No records match your search criteria.</div>';
      return;
    }

    const sorted = [...adrs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    container.innerHTML = sorted.map((adr) => {
      const isSelected = adr.id === selectedAdrId;
      const statusClass = (adr.status === 'superseded' || adr.status === 'deprecated') ? ` status-${adr.status}` : '';

      let badge = '';
      if (adr.reviewStatus === 'expired') badge = '<span class="review-badge badge-expired" title="Expired">EXP</span>';
      else if (adr.reviewStatus === 'overdue') badge = '<span class="review-badge badge-overdue" title="Review overdue">DUE</span>';
      else if (adr.reviewStatus === 'due-soon') badge = '<span class="review-badge badge-due-soon" title="Review due soon">SOON</span>';

      let confBadge = '';
      if (adr.confidence === 'low') confBadge = '<span class="confidence-badge conf-low" title="Low confidence">LOW</span>';
      else if (adr.confidence === 'medium') confBadge = '<span class="confidence-badge conf-medium" title="Medium confidence">MED</span>';

      return `
        <div class="timeline-entry${isSelected ? ' selected' : ''}${statusClass}" data-adr-id="${escapeHtml(adr.id)}" title="${escapeHtml(adr.status.toUpperCase())} — #${escapeHtml(adr.id)} ${escapeHtml(adr.title)}">
          <div class="entry-number">${escapeHtml(adr.id.replace(/^ADR-/i, ''))}</div>
          <div class="entry-dot-container">
            <div class="entry-dot ${adr.status}"></div>
          </div>
          <div class="entry-content">
            <span class="entry-title">${escapeHtml(adr.title)}</span>
            ${badge}${confBadge}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.timeline-entry').forEach(item => {
      item.addEventListener('click', () => {
        const adrId = item.getAttribute('data-adr-id');
        if (adrId) selectAdr(adrId);
      });
    });
  },

  updateSelection(adrId) {
    const container = document.getElementById('timeline-entries');
    if (!container) return;
    container.querySelectorAll('.timeline-entry').forEach(item => {
      const id = item.getAttribute('data-adr-id');
      item.classList.toggle('selected', id === adrId);
    });
  }
};

// ===== Graph Module =====
const Graph = {
  _svg: null,
  _g: null,
  _simulation: null,
  _linkSel: null,
  _nodeSel: null,
  _linkTextSel: null,
  _hullSel: null,
  _container: null,
  _width: 0,
  _height: 0,
  _selectedNodeId: null,
  _hoveredNodeId: null,
  _currentNodes: null,
  _tagColorMap: {},

  init(container) {
    this._container = container;
    const rect = container.getBoundingClientRect();
    this._width = rect.width;
    this._height = rect.height;

    this._svg = select(container)
      .append('svg')
      .attr('class', 'graph-svg')
      .attr('width', this._width)
      .attr('height', this._height);

    // Arrow marker defs
    const defs = this._svg.append('defs');
    ['arrow-default', 'arrow-selected'].forEach(id => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', id === 'arrow-selected' ? '#fff' : '#888')
        .attr('d', 'M0,-5L10,0L0,5');
    });

    // Main group for zoom/pan
    this._g = this._svg.append('g').attr('class', 'main-group');

    // Zoom behavior
    const zoomBehavior = d3Zoom()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        this._g.attr('transform', event.transform);
      });

    this._svg.call(zoomBehavior);

    // Click background to deselect
    this._svg.on('click', () => {
      selectAdr(this._selectedNodeId); // toggle off
    });

    // ResizeObserver
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      this._width = width;
      this._height = height;
      this._svg.attr('width', width).attr('height', height);
      if (this._simulation) {
        this._simulation.force('center', forceCenter(width / 2, height / 2));
        this._simulation.alpha(0.1).restart();
      }
    });
    observer.observe(container);
  },

  render(adrs, edges) {
    if (!this._g) return;

    // Clean previous
    this._g.selectAll('*').remove();
    if (this._simulation) {
      this._simulation.stop();
      this._simulation = null;
    }

    if (adrs.length === 0) {
      this._linkSel = null;
      this._nodeSel = null;
      this._linkTextSel = null;
      return;
    }

    const { width, height } = this._svg.node().getBoundingClientRect();
    this._width = width;
    this._height = height;

    const nodes = adrs.map(d => ({ ...d }));
    const links = [];

    // Build tag color map for all known tags
    const allKnownTags = {};
    for (const adr of adrs) {
      if (adr.tags) {
        for (const tag of adr.tags) {
          if (!allKnownTags[tag]) allKnownTags[tag] = true;
        }
      }
    }
    const sortedAllTags = Object.keys(allKnownTags).sort();
    sortedAllTags.forEach((tag, i) => {
      if (!this._tagColorMap[tag]) {
        this._tagColorMap[tag] = TAG_GROUP_COLORS[i % TAG_GROUP_COLORS.length];
      }
    });

    edges.forEach(edge => {
      const sourceExists = nodes.find(n => n.id === edge.source);
      const targetExists = nodes.find(n => n.id === edge.target);
      if (sourceExists && targetExists) {
        links.push({ source: edge.source, target: edge.target, type: edge.type, reason: edge.reason });
      }
    });

    // Force simulation
    const radius = Math.min(width, height) * 0.35;
    const simulation = forceSimulation(nodes)
      .force('link', forceLink(links).id(d => d.id).distance(100))
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collision', forceCollide().radius(40))
      .force('radial', forceRadial(radius * 0.6, width / 2, height / 2).strength(0.05));

    this._simulation = simulation;

    // Hull group (behind everything)
    this._hullGroup = this._g.append('g').attr('class', 'hulls-group');

    // Links
    const linkGroup = this._g.append('g').attr('class', 'links-group');
    this._linkSel = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'adr-link')
      .attr('stroke', d => d._isGhost ? '#60a5fa' : '#888')
      .attr('stroke-opacity', d => d._isGhost ? 0.6 : 1)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', d => d._isGhost ? '3,3' : '6,4')
      .attr('marker-end', 'url(#arrow-default)');

    // Link labels
    this._linkTextSel = this._g.append('g').selectAll('text')
      .data(links)
      .join('text')
      .attr('font-size', '9px')
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .style('pointer-events', 'auto')
      .style('cursor', d => d.reason ? 'help' : 'default')
      .attr('font-family', "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace")
      .text(d => d.type)
      .each(function (d) {
        if (d.reason) {
          select(this).append('title').text(d.reason);
        }
      });

    // Nodes
    const self = this;
    this._nodeSel = this._g.append('g').attr('class', 'nodes-group')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'adr-node')
      .attr('cursor', 'pointer')
      .on('click', function (event, d) {
        event.stopPropagation();
        selectAdr(d.id);
      })
      .on('mouseenter', function (event, d) {
        self._hoveredNodeId = d.id;
        self.updateStyles();
      })
      .on('mouseleave', function () {
        self._hoveredNodeId = null;
        self.updateStyles();
      })
      .call(d3Drag()
        .on('start', (event) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on('drag', (event) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on('end', (event) => {
          if (!event.active) simulation.alphaTarget(0);
        })
      );

    // Dim superseded/deprecated nodes
    this._nodeSel.style('opacity', d =>
      (d.status === 'superseded' || d.status === 'deprecated') ? 0.4 : 1
    );

    // Node circles
    this._nodeSel.append('circle')
      .attr('r', d => d._isGhost ? 18 : 14)
      .attr('fill', d => d._isGhost ? 'rgba(96,165,250,0.15)' : getStatusColor(d.status))
      .attr('stroke', d => d._isGhost ? '#60a5fa' : '#1a1b1e')
      .attr('stroke-width', d => d._isGhost ? 2 : 2)
      .attr('stroke-dasharray', d => d._isGhost ? '4,3' : 'none')
      .style('transition', 'stroke 0.2s, stroke-width 0.2s, filter 0.2s');

    // Node ID text (inside circle)
    this._nodeSel.append('text')
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', 'white')
      .attr('font-weight', 'bold')
      .attr('font-family', "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace")
      .style('pointer-events', 'none')
      .text(d => {
        const match = d.id.match(/\d+/);
        return match ? match[0] : d.id;
      });

    // Node title text (beside circle)
    this._nodeSel.append('text')
      .attr('dx', 20)
      .attr('dy', '0.35em')
      .attr('font-size', '11px')
      .attr('fill', '#ccc')
      .attr('font-family', "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .style('pointer-events', 'none')
      .text(d => truncate(d.title, 25));

    this._currentNodes = nodes;

    // Tick
    simulation.on('tick', () => {
      this._linkSel
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      this._linkTextSel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      this._nodeSel
        .attr('transform', d => `translate(${d.x},${d.y})`);

      // Update hulls
      if (groupByTags.size > 0 && this._hullGroup) {
        this.renderHulls();
      }
    });
  },

  renderHulls() {
    if (!this._hullGroup || !this._currentNodes || groupByTags.size === 0) {
      if (this._hullGroup) this._hullGroup.selectAll('*').remove();
      return;
    }

    // Group nodes by tags
    const groups = {};
    for (const node of this._currentNodes) {
      if (node.tags) {
        for (const tag of node.tags) {
          if (!groups[tag]) groups[tag] = [];
          groups[tag].push(node);
        }
      }
    }

    // Filter to selected grouping tags
    const hullData = [];
    for (const [tag, tagNodes] of Object.entries(groups)) {
      if (!groupByTags.has(tag)) continue;
      const positioned = tagNodes.filter(n => n.x != null && n.y != null);
      if (positioned.length >= 2) {
        hullData.push({ tag, nodes: positioned });
      }
    }

    const hullSel = this._hullGroup.selectAll('path')
      .data(hullData, d => d.tag);

    hullSel.exit().remove();

    const hullEnter = hullSel.enter().append('path');
    const hullMerge = hullEnter.merge(hullSel);

    const self = this;
    hullMerge
      .attr('d', d => {
        const padding = 30;
        const points = d.nodes.map(n => [n.x, n.y]);
        return self._computeHullPath(points, padding);
      })
      .attr('fill', d => {
        const color = self._tagColorMap[d.tag] || '#3b82f6';
        return color;
      })
      .attr('fill-opacity', 0.06)
      .attr('stroke', d => {
        const color = self._tagColorMap[d.tag] || '#3b82f6';
        return color;
      })
      .attr('stroke-opacity', 0.25)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')
      .style('pointer-events', 'none');
  },

  _computeHullPath(points, padding) {
    if (points.length < 2) return '';

    // Generate padding points around each node (Minkowski sum approach).
    // This guarantees every node sits inside the hull with at least `padding` margin.
    const expanded = [];
    const steps = 8; // octagon around each point
    for (const [px, py] of points) {
      for (let i = 0; i < steps; i++) {
        const angle = (2 * Math.PI * i) / steps;
        expanded.push([px + Math.cos(angle) * padding, py + Math.sin(angle) * padding]);
      }
    }

    // Convex hull of all expanded points
    const hull = this._convexHull(expanded);
    if (hull.length < 3) {
      // Fallback for degenerate cases
      const [a, b] = points;
      const dx = (b[0] - a[0]) || 0;
      const dy = (b[1] - a[1]) || 0;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len * padding;
      const ny = dx / len * padding;
      return `M${a[0] + nx},${a[1] + ny}
              L${b[0] + nx},${b[1] + ny}
              A${padding},${padding} 0 0,1 ${b[0] - nx},${b[1] - ny}
              L${a[0] - nx},${a[1] - ny}
              A${padding},${padding} 0 0,1 ${a[0] + nx},${a[1] + ny}Z`;
    }

    // Smooth path using quadratic bezier through midpoints
    const n = hull.length;
    let path = `M${(hull[n - 1][0] + hull[0][0]) / 2},${(hull[n - 1][1] + hull[0][1]) / 2}`;
    for (let i = 0; i < n; i++) {
      const curr = hull[i];
      const next = hull[(i + 1) % n];
      const mx = (curr[0] + next[0]) / 2;
      const my = (curr[1] + next[1]) / 2;
      path += ` Q${curr[0]},${curr[1]} ${mx},${my}`;
    }
    path += 'Z';
    return path;
  },

  _convexHull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length <= 2) return pts;

    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  },

  updateStyles() {
    const selectedId = this._selectedNodeId;
    const hoveredId = this._hoveredNodeId;

    // Compute impact map when a node is selected
    const impactMap = selectedId
      ? computeImpactMap(selectedId, this._linkSel ? this._linkSel.data() : [], impactRadius)
      : new Map();
    const hasImpact = impactMap.size > 1; // >1 because it includes the selected node itself

    if (this._linkSel) {
      this._linkSel.each(function (d) {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source;
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const isDirectActive = srcId === selectedId || tgtId === selectedId ||
                         srcId === hoveredId || tgtId === hoveredId;
        // Ripple: edge connects two impacted nodes
        const isRipple = hasImpact && impactMap.has(srcId) && impactMap.has(tgtId);

        const el = select(this);
        if (isDirectActive) {
          el.attr('stroke', '#fff')
            .attr('stroke-opacity', 1)
            .attr('stroke-width', 2.5)
            .attr('marker-end', 'url(#arrow-selected)')
            .style('animation', 'dash 1s linear infinite');
        } else if (isRipple) {
          const maxDepth = Math.max(impactMap.get(srcId).depth, impactMap.get(tgtId).depth);
          const rippleOpacity = Math.max(0.2, 1 - maxDepth * 0.3);
          el.attr('stroke', '#60a5fa')
            .attr('stroke-opacity', rippleOpacity)
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#arrow-default)')
            .style('animation', 'dash 2s linear infinite');
        } else {
          el.attr('stroke', '#888')
            .attr('stroke-opacity', hasImpact ? 0.15 : 1)
            .attr('stroke-width', 1.5)
            .attr('marker-end', 'url(#arrow-default)')
            .style('animation', 'none');
        }
      });
    }

    if (this._nodeSel) {
      this._nodeSel.each(function (d) {
        const isFocused = d.id === selectedId || d.id === hoveredId;
        const isDimmed = d.status === 'superseded' || d.status === 'deprecated';
        const impactInfo = impactMap.get(d.id);
        const isImpacted = impactInfo && impactInfo.depth > 0;

        let opacity;
        if (isFocused) {
          opacity = 1;
        } else if (hasImpact) {
          if (isImpacted) {
            opacity = Math.max(0.4, 1 - impactInfo.depth * 0.25);
          } else {
            opacity = 0.12;
          }
        } else {
          opacity = isDimmed ? 0.4 : 1;
        }

        select(this).style('opacity', opacity);

        const circle = select(this).select('circle');
        if (isFocused) {
          circle.attr('stroke', '#fff')
            .attr('stroke-width', 3)
            .style('filter', 'drop-shadow(0 0 8px rgba(255,255,255,0.4))');
        } else if (isImpacted) {
          const glowIntensity = Math.max(0.1, 0.4 - impactInfo.depth * 0.1);
          circle.attr('stroke', '#60a5fa')
            .attr('stroke-width', 2.5)
            .style('filter', `drop-shadow(0 0 ${6 - impactInfo.depth}px rgba(96,165,250,${glowIntensity}))`);
        } else {
          circle.attr('stroke', '#1a1b1e')
            .attr('stroke-width', 2)
            .style('filter', 'none');
        }
      });
    }
  },

  focusNode(adrId) {
    if (!this._nodeSel || !this._svg) return;
    selectAdr(adrId);

    let targetNode = null;
    this._nodeSel.each(function (d) {
      if (d.id === adrId) targetNode = d;
    });

    if (targetNode && targetNode.x != null) {
      const transform = zoomIdentity
        .translate(this._width / 2 - targetNode.x * 1.5, this._height / 2 - targetNode.y * 1.5)
        .scale(1.5);
      this._svg.transition().duration(300).call(
        d3Zoom().scaleExtent([0.2, 3]).transform,
        transform
      );
    }
  }
};

// ===== Graph Toolbar Controls =====
let graphGroupListOpen = false;
let graphFilterListOpen = false;
let graphInsightsListOpen = false;

function initGraphToolbar() {
  // Group toggle
  const groupToggle = document.getElementById('graph-group-toggle');
  if (groupToggle) {
    groupToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      graphGroupListOpen = !graphGroupListOpen;
      graphFilterListOpen = false;
      graphInsightsListOpen = false;

      renderGraphToolbarLists();
    });
  }

  // Filter toggle
  const filterToggle = document.getElementById('graph-filter-toggle');
  if (filterToggle) {
    filterToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      graphFilterListOpen = !graphFilterListOpen;
      graphGroupListOpen = false;
      graphInsightsListOpen = false;

      renderGraphToolbarLists();
    });
  }

  // Insights toggle
  const insightsToggle = document.getElementById('graph-insights-toggle');
  if (insightsToggle) {
    insightsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      graphInsightsListOpen = !graphInsightsListOpen;
      graphGroupListOpen = false;
      graphFilterListOpen = false;

      renderGraphToolbarLists();
      // Trigger analysis on first open if no insights yet
      if (graphInsightsListOpen && allInsights.length === 0 && !insightsLoading) {
        vscode.postMessage({ type: 'analyzeInsights' });
      }
    });
  }

  // Prevent clicks inside lists from closing them
  document.getElementById('graph-group-tag-list')?.addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('graph-filter-tag-list')?.addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('graph-insights-list')?.addEventListener('click', (e) => e.stopPropagation());
}

function renderGraphToolbarLists() {
  renderGraphGroupTagList();
  renderGraphFilterTagList();
  renderInsightsList();
  renderGroupLegend();

  // Update toggle active states
  const groupToggle = document.getElementById('graph-group-toggle');
  const filterToggle = document.getElementById('graph-filter-toggle');
  const insightsToggle = document.getElementById('graph-insights-toggle');
  if (groupToggle) {
    groupToggle.classList.toggle('active', groupByTags.size > 0);
    groupToggle.classList.toggle('open', graphGroupListOpen);
  }
  if (filterToggle) {
    filterToggle.classList.toggle('active', activeTags.size > 0);
    filterToggle.classList.toggle('open', graphFilterListOpen);
  }
  if (insightsToggle) {
    insightsToggle.classList.toggle('active', allInsights.length > 0);
    insightsToggle.classList.toggle('open', graphInsightsListOpen);
  }

  // Update badge counts
  const groupCount = document.getElementById('graph-group-count');
  const filterCount = document.getElementById('graph-filter-count');
  const insightsCount = document.getElementById('graph-insights-count');
  if (groupCount) {
    groupCount.textContent = groupByTags.size || '';
    groupCount.style.display = groupByTags.size > 0 ? 'inline-block' : 'none';
  }
  if (filterCount) {
    filterCount.textContent = activeTags.size || '';
    filterCount.style.display = activeTags.size > 0 ? 'inline-block' : 'none';
  }
  if (insightsCount) {
    insightsCount.textContent = allInsights.length || '';
    insightsCount.style.display = allInsights.length > 0 ? 'inline-block' : 'none';
  }
}

function renderGraphGroupTagList() {
  const tagList = document.getElementById('graph-group-tag-list');
  if (!tagList) return;

  tagList.classList.toggle('open', graphGroupListOpen);
  if (!graphGroupListOpen) return;

  const tagCounts = getTagCounts();
  // Only tags with 2+ items, sorted by count descending
  const sortedTags = Object.keys(tagCounts)
    .filter(t => tagCounts[t] > 1)
    .sort((a, b) => tagCounts[b] - tagCounts[a]);

  // Build tag color map
  sortedTags.forEach((tag, i) => {
    if (!Graph._tagColorMap[tag]) {
      Graph._tagColorMap[tag] = TAG_GROUP_COLORS[i % TAG_GROUP_COLORS.length];
    }
  });

  const allSelected = sortedTags.length > 0 && sortedTags.every(t => groupByTags.has(t));

  tagList.innerHTML = `<div class="graph-toolbar-list-actions">
      <button class="graph-toolbar-action-btn" id="graph-group-select-all">${allSelected ? 'Clear all' : 'Select all'}</button>
    </div>` +
    sortedTags.map(tag => {
      const isActive = groupByTags.has(tag);
      const color = Graph._tagColorMap[tag] || '#3b82f6';
      return `<div class="graph-group-tag-item${isActive ? ' active' : ''}" data-tag="${escapeHtml(tag)}">
        <span class="graph-group-tag-swatch" style="background:${color}"></span>
        <span class="graph-group-tag-name">${escapeHtml(tag)}</span>
        <span class="graph-group-tag-count">${tagCounts[tag]}</span>
      </div>`;
    }).join('');

  // Select all / clear all
  document.getElementById('graph-group-select-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (allSelected) {
      groupByTags.clear();
    } else {
      sortedTags.forEach(t => groupByTags.add(t));
    }
    renderGraphToolbarLists();
    Graph.renderHulls();
  });

  tagList.querySelectorAll('.graph-group-tag-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = item.getAttribute('data-tag');
      if (groupByTags.has(tag)) {
        groupByTags.delete(tag);
      } else {
        groupByTags.add(tag);
      }
      renderGraphToolbarLists();
      Graph.renderHulls();
    });
  });
}

function renderGraphFilterTagList() {
  const tagList = document.getElementById('graph-filter-tag-list');
  if (!tagList) return;

  tagList.classList.toggle('open', graphFilterListOpen);
  if (!graphFilterListOpen) return;

  const tagCounts = getTagCounts();
  const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

  const allSelected = sortedTags.length > 0 && sortedTags.every(t => activeTags.has(t));

  tagList.innerHTML = `<div class="graph-toolbar-list-actions">
      <button class="graph-toolbar-action-btn" id="graph-filter-select-all">${allSelected ? 'Clear all' : 'Select all'}</button>
    </div>` +
    sortedTags.map(tag => {
      const isActive = activeTags.has(tag);
      return `<div class="graph-group-tag-item${isActive ? ' active' : ''}" data-tag="${escapeHtml(tag)}">
        <span class="graph-group-tag-swatch" style="background:${isActive ? '#3b82f6' : '#444'}"></span>
        <span class="graph-group-tag-name">${escapeHtml(tag)}</span>
        <span class="graph-group-tag-count">${tagCounts[tag]}</span>
      </div>`;
    }).join('');

  document.getElementById('graph-filter-select-all')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (allSelected) {
      activeTags.clear();
    } else {
      sortedTags.forEach(t => activeTags.add(t));
    }
    renderGraphToolbarLists();
    applyFilters();
  });

  tagList.querySelectorAll('.graph-group-tag-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = item.getAttribute('data-tag');
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      renderGraphToolbarLists();
      applyFilters();
    });
  });
}

// ===== Insights List =====
function renderInsightsList() {
  const listEl = document.getElementById('graph-insights-list');
  if (!listEl) return;

  listEl.classList.toggle('open', graphInsightsListOpen);
  if (!graphInsightsListOpen) return;

  if (insightsLoading) {
    listEl.innerHTML = `
      <div class="insights-loading">
        <div class="insights-spinner"></div>
        <span>Analyzing ADRs with AI...</span>
      </div>`;
    return;
  }

  if (allInsights.length === 0) {
    listEl.innerHTML = `
      <div class="insights-empty">
        <div class="insights-empty-text">No insights yet</div>
        <button class="insights-analyze-btn" id="insights-analyze-btn">Analyze with AI</button>
      </div>`;
    const analyzeBtn = document.getElementById('insights-analyze-btn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'analyzeInsights' });
      });
    }
    return;
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...allInsights].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const typeIcons = {
    'contradiction': '\u26A0',
    'missing-relation': '\u{1F517}',
    'suggested-update': '\u{1F504}',
    'staleness': '\u23F3',
    'coherence': '\u{1F9E9}',
  };

  let html = `<div class="insights-header-row">
    <span class="insights-result-count">${allInsights.length} insight${allInsights.length !== 1 ? 's' : ''}</span>
    <button class="insights-reanalyze-btn" id="insights-reanalyze-btn" title="Re-analyze">Re-analyze</button>
  </div>`;

  html += sorted.map(insight => {
    const icon = typeIcons[insight.type] || '\u{1F4A1}';
    const adrLinks = insight.adrIds.map(id =>
      `<span class="insight-adr-link" data-adr-id="${escapeHtml(id)}">${escapeHtml(id)}</span>`
    ).join(' ');
    return `
      <div class="insight-item severity-${insight.severity}">
        <div class="insight-icon">${icon}</div>
        <div class="insight-content">
          <div class="insight-title">${escapeHtml(insight.title)}</div>
          <div class="insight-desc">${escapeHtml(insight.description)}</div>
          <div class="insight-suggestion">${escapeHtml(insight.suggestion)}</div>
          <div class="insight-adrs">${adrLinks}</div>
        </div>
      </div>
    `;
  }).join('');

  listEl.innerHTML = html;

  // Re-analyze button
  const reanalyzeBtn = document.getElementById('insights-reanalyze-btn');
  if (reanalyzeBtn) {
    reanalyzeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ type: 'analyzeInsights' });
    });
  }

  // Click handlers for ADR links
  listEl.querySelectorAll('.insight-adr-link').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const adrId = el.getAttribute('data-adr-id');
      if (adrId) Graph.focusNode(adrId);
    });
  });
}

// ===== Group Legend Table =====
function renderGroupLegend() {
  const legend = document.getElementById('graph-group-legend');
  if (!legend) return;

  if (groupByTags.size === 0) {
    legend.classList.remove('visible');
    legend.innerHTML = '';
    return;
  }

  // Build data: for each active group tag, collect its ADRs from current filtered set
  const { adrs } = getFilteredData();
  const tagCounts = getTagCounts();
  const groups = {};
  for (const adr of adrs) {
    if (adr.tags) {
      for (const tag of adr.tags) {
        if (groupByTags.has(tag)) {
          if (!groups[tag]) groups[tag] = [];
          groups[tag].push(adr);
        }
      }
    }
  }

  // Sort by count descending
  const sortedTags = [...groupByTags].sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0));

  const rows = sortedTags.map(tag => {
    const tagAdrs = groups[tag] || [];
    const color = Graph._tagColorMap[tag] || '#3b82f6';
    const adrNames = tagAdrs.map(a => `#${a.id}`).join(', ');
    return `<tr>
      <td><div class="graph-group-legend-color">
        <span class="graph-group-legend-swatch" style="background:${color}"></span>
        <span class="graph-group-legend-tag">${escapeHtml(tag)}</span>
      </div></td>
      <td class="graph-group-legend-count">${tagAdrs.length}</td>
      <td class="graph-group-legend-adrs" title="${escapeHtml(adrNames)}">${escapeHtml(adrNames)}</td>
    </tr>`;
  }).join('');

  legend.innerHTML = `
    <div class="graph-group-legend-header">
      GROUPS <span>${sortedTags.length} tag${sortedTags.length !== 1 ? 's' : ''}</span>
    </div>
    <table>
      <thead><tr>
        <th>TAG</th>
        <th style="text-align:right">COUNT</th>
        <th>ADRs</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  legend.classList.add('visible');
}

// ===== Resizer Module =====
const Resizer = {
  init() {
    const handleTimeline = document.getElementById('resize-handle-timeline');
    const handlePreview = document.getElementById('resize-handle-preview');
    const timelinePanel = document.querySelector('.timeline-panel');
    const graphPanel = document.querySelector('.graph-panel');
    const previewPanel = document.getElementById('preview-panel');

    if (handleTimeline && timelinePanel && graphPanel) {
      this._setupHandle(handleTimeline, {
        getSize: () => timelinePanel.getBoundingClientRect().width,
        setSize: (w) => { timelinePanel.style.width = Math.max(140, Math.min(w, 600)) + 'px'; },
        direction: 1,
      });
    }

    if (handlePreview && previewPanel && graphPanel) {
      this._setupHandle(handlePreview, {
        getSize: () => previewPanel.getBoundingClientRect().width,
        setSize: (w) => { previewPanel.style.width = Math.max(200, Math.min(w, 700)) + 'px'; },
        direction: -1, // drag left = wider preview
      });
    }
  },

  _setupHandle(handle, { getSize, setSize, direction }) {
    let startX = 0;
    let startSize = 0;

    const onMouseMove = (e) => {
      const delta = (e.clientX - startX) * direction;
      setSize(startSize + delta);
    };

    const onMouseUp = () => {
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startSize = getSize();
      handle.classList.add('dragging');
      document.body.classList.add('resizing');
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }
};

// ===== Search & Filter =====
let searchTimeout = null;

function onSearchInput(e) {
  searchQuery = e.target.value;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(applyFilters, 200);
}


function applyFilters() {
  const filtered = getFilteredData();
  const { adrs, edges } = filtered;
  const countEl = document.getElementById('record-count');
  if (countEl) {
    countEl.textContent = `${adrs.length} of ${allAdrs.length} records`;
  }
  Timeline.render(adrs);
  Graph.render(adrs, edges);

  // Keep graph toolbar badges in sync
  renderGraphToolbarLists();

  // If selected ADR is no longer in filtered set, close preview
  if (selectedAdrId) {
    const stillVisible = adrs.some(a => a.id === selectedAdrId);
    if (!stillVisible) {
      selectedAdrId = null;
      Preview.close();
    }
  }
}

// ===== Analytics Module =====
const Analytics = {
  _visible: false,
  _lifecycle: null,

  init() {
    const toggle = document.getElementById('analytics-toggle');
    const close = document.getElementById('analytics-close');
    if (toggle) {
      toggle.addEventListener('click', () => {
        this._visible = !this._visible;
        this._updateVisibility();
        if (this._visible && this._lifecycle) this.render(this._lifecycle);
      });
    }
    if (close) {
      close.addEventListener('click', () => {
        this._visible = false;
        this._updateVisibility();
      });
    }
  },

  _updateVisibility() {
    const panel = document.getElementById('analytics-panel');
    if (panel) panel.style.display = this._visible ? 'flex' : 'none';
    const toggle = document.getElementById('analytics-toggle');
    if (toggle) toggle.classList.toggle('active', this._visible);
    if (this._visible && typeof Distill !== 'undefined') {
      Distill._visible = false;
      Distill._updateVisibility();
    }
  },

  update(lifecycle) {
    this._lifecycle = lifecycle;
    if (this._visible) this.render(lifecycle);
  },

  render(lifecycle) {
    if (!lifecycle) return;
    this._renderVelocity(lifecycle.velocity);
    this._renderFunnel(lifecycle.funnel);
    this._renderStability(lifecycle.tagStability);
  },

  _renderVelocity(velocity) {
    const container = document.getElementById('velocity-chart');
    if (!container) return;

    if (!velocity || velocity.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No data</div>';
      return;
    }

    const maxCount = Math.max(...velocity.map(v => v.count), 1);
    const barWidth = Math.max(12, Math.min(40, (container.clientWidth - 40) / velocity.length - 2));

    container.innerHTML = `
      <div class="velocity-bars">
        ${velocity.map(v => {
          const height = Math.max(2, (v.count / maxCount) * 80);
          const label = v.month.slice(5); // MM only
          return `
            <div class="velocity-bar-group" title="${v.month}: ${v.count} decision${v.count !== 1 ? 's' : ''}">
              <div class="velocity-bar" style="height:${height}px;width:${barWidth}px"></div>
              <div class="velocity-count">${v.count}</div>
              <div class="velocity-label">${label}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  _renderFunnel(funnel) {
    const container = document.getElementById('funnel-chart');
    if (!container) return;

    const stages = [
      { label: 'Proposed', value: funnel.proposed, color: 'var(--color-proposed)' },
      { label: 'Accepted', value: funnel.accepted, color: 'var(--color-accepted)' },
      { label: 'Amended', value: funnel.amended, color: '#8b5cf6' },
      { label: 'Superseded', value: funnel.superseded, color: 'var(--color-superseded)' },
      { label: 'Deprecated', value: funnel.deprecated, color: 'var(--color-deprecated)' },
    ];
    const maxVal = Math.max(...stages.map(s => s.value), 1);

    container.innerHTML = stages.map(stage => {
      const width = Math.max(4, (stage.value / maxVal) * 100);
      return `
        <div class="funnel-row">
          <span class="funnel-label">${stage.label}</span>
          <div class="funnel-bar-track">
            <div class="funnel-bar" style="width:${width}%;background:${stage.color}"></div>
          </div>
          <span class="funnel-value">${stage.value}</span>
        </div>
      `;
    }).join('');
  },

  _renderStability(tagStability) {
    const container = document.getElementById('stability-chart');
    if (!container) return;

    if (!tagStability || tagStability.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No tags</div>';
      return;
    }

    container.innerHTML = tagStability.map(t => {
      const color = t.stability >= 80 ? '#10b981' : t.stability >= 50 ? '#f59e0b' : '#ef4444';
      return `
        <div class="stability-row">
          <span class="stability-tag">${escapeHtml(t.tag)}</span>
          <div class="stability-bar-track">
            <div class="stability-bar" style="width:${t.stability}%;background:${color}"></div>
          </div>
          <span class="stability-value">${t.stability}%</span>
        </div>
      `;
    }).join('');
  }
};

// ===== Health Dashboard Module =====
const HealthDashboard = {
  _expanded: false,

  init() {
    const toggle = document.getElementById('health-header-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        this._expanded = !this._expanded;
        const dashboard = document.getElementById('health-dashboard');
        if (dashboard) {
          dashboard.classList.toggle('collapsed', !this._expanded);
          dashboard.classList.toggle('expanded', this._expanded);
        }
        const chevron = document.getElementById('health-chevron');
        if (chevron) {
          chevron.style.transform = this._expanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      });
    }
  },

  render(report) {
    if (!report) return;

    const gradeEl = document.getElementById('health-grade');
    const scoreEl = document.getElementById('health-score');
    const issueCountEl = document.getElementById('health-issue-count');
    const statsEl = document.getElementById('health-stats');
    const issuesEl = document.getElementById('health-issues');
    const dashboard = document.getElementById('health-dashboard');

    if (gradeEl) {
      gradeEl.textContent = report.grade;
      gradeEl.className = 'health-grade-badge grade-' + report.grade.toLowerCase();
    }

    if (scoreEl) {
      scoreEl.textContent = report.score + '/100';
    }

    if (issueCountEl) {
      const count = report.issues.length;
      if (count === 0) {
        issueCountEl.textContent = 'No issues';
        issueCountEl.className = 'health-issue-count no-issues';
      } else {
        issueCountEl.textContent = count + ' issue' + (count !== 1 ? 's' : '');
        const hasCritical = report.issues.some(i => i.severity === 'critical');
        issueCountEl.className = 'health-issue-count ' + (hasCritical ? 'has-critical' : 'has-warnings');
      }
    }

    // Stats row
    if (statsEl) {
      const s = report.stats;
      statsEl.innerHTML = `
        <div class="health-stat">
          <span class="health-stat-value">${s.total}</span>
          <span class="health-stat-label">Total</span>
        </div>
        <div class="health-stat">
          <span class="health-stat-value stat-accepted">${s.accepted}</span>
          <span class="health-stat-label">Accepted</span>
        </div>
        <div class="health-stat">
          <span class="health-stat-value stat-proposed">${s.proposed}</span>
          <span class="health-stat-label">Proposed</span>
        </div>
        <div class="health-stat">
          <span class="health-stat-value stat-deprecated">${s.deprecated}</span>
          <span class="health-stat-label">Deprecated</span>
        </div>
        <div class="health-stat">
          <span class="health-stat-value stat-superseded">${s.superseded}</span>
          <span class="health-stat-label">Superseded</span>
        </div>
      `;
    }

    // Issues list
    if (issuesEl) {
      if (report.issues.length === 0) {
        issuesEl.innerHTML = '<div class="health-no-issues">All checks passed</div>';
      } else {
        issuesEl.innerHTML = report.issues.map(issue => {
          const severityIcon = issue.severity === 'critical' ? '!!' : issue.severity === 'warning' ? '!' : 'i';
          const adrLinks = issue.adrIds.map(id =>
            `<span class="health-issue-adr" data-adr-id="${escapeHtml(id)}">${escapeHtml(id)}</span>`
          ).join(' ');
          return `
            <div class="health-issue severity-${issue.severity}">
              <div class="health-issue-icon">${severityIcon}</div>
              <div class="health-issue-content">
                <div class="health-issue-title">${escapeHtml(issue.title)}</div>
                <div class="health-issue-desc">${escapeHtml(issue.description)}</div>
                <div class="health-issue-adrs">${adrLinks}</div>
              </div>
            </div>
          `;
        }).join('');

        // Click handler for ADR links in issues
        issuesEl.querySelectorAll('.health-issue-adr').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const adrId = el.getAttribute('data-adr-id');
            if (adrId) {
              Graph.focusNode(adrId);
            }
          });
        });
      }
    }

    // Show dashboard
    if (dashboard) {
      dashboard.style.display = '';
    }
  }
};

// ===== Distill Module =====
const DISTILL_CATEGORY_LABELS = {
  'verbose-filler': 'Filler',
  'redundant-section': 'Redundant',
  'excessive-alternatives': 'Too Many Alternatives',
  'implementation-detail': 'Implementation Detail',
  'generic-consequence': 'Generic',
  'unnecessary-background': 'Unnecessary Background',
};

const Distill = {
  _visible: false,
  _suggestions: {},
  _loading: {},
  _reports: [],
  _bulkLoading: false,
  _progress: null,
  _selectedAdrId: null,

  init() {
    const toggle = document.getElementById('distill-toggle');
    const close = document.getElementById('distill-close');
    if (toggle) {
      toggle.addEventListener('click', () => {
        this._visible = !this._visible;
        this._updateVisibility();
        if (this._visible) this._renderSidebar();
      });
    }
    if (close) {
      close.addEventListener('click', () => {
        this._visible = false;
        this._updateVisibility();
      });
    }
    document.getElementById('distill-all-btn')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'analyzeDistillAll' });
    });
    document.getElementById('distill-content-apply-all')?.addEventListener('click', () => {
      if (this._selectedAdrId) {
        vscode.postMessage({ type: 'applyDistillAll', adrId: this._selectedAdrId });
      }
    });
  },

  _updateVisibility() {
    const panel = document.getElementById('distill-panel');
    if (panel) panel.style.display = this._visible ? 'flex' : 'none';
    const toggle = document.getElementById('distill-toggle');
    if (toggle) toggle.classList.toggle('active', this._visible);
    if (this._visible) {
      Analytics._visible = false;
      Analytics._updateVisibility();
    }
  },

  updateAdrs() {
    if (this._visible) {
      this._renderSidebar();
      if (this._selectedAdrId) this._renderContent(this._selectedAdrId);
    }
  },

  onProgress(completed, total) {
    this._progress = { completed, total };
    this._renderProgress();
  },

  onBulkLoadingChange(loading) {
    this._bulkLoading = loading;
    if (!loading) this._progress = null;
    this._renderProgress();
    this._renderSidebar();
  },

  onBulkResults(reports) {
    this._reports = reports;
    for (const r of reports) {
      this._suggestions[r.adrId] = r.suggestions;
    }
    this._renderSidebar();
    if (this._selectedAdrId) this._renderContent(this._selectedAdrId);
  },

  onSuggestions(adrId, suggestions) {
    this._suggestions[adrId] = suggestions;
    this._renderSidebar();
    if (this._selectedAdrId === adrId) this._renderContent(adrId);
  },

  onLoadingChange(adrId, loading) {
    this._loading[adrId] = loading;
    this._renderSidebar();
    if (this._selectedAdrId === adrId) this._renderContent(adrId);
  },

  _renderProgress() {
    const el = document.getElementById('distill-progress');
    if (!el) return;
    if (!this._progress && !this._bulkLoading) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    if (this._progress) {
      const pct = Math.round((this._progress.completed / this._progress.total) * 100);
      el.innerHTML = `
        <span>Distilling ${this._progress.completed}/${this._progress.total}...</span>
        <div class="distill-progress-bar">
          <div class="distill-progress-fill" style="width:${pct}%"></div>
        </div>
      `;
    } else {
      el.innerHTML = '<div class="distill-loading"><div class="insights-spinner"></div> Preparing...</div>';
    }
  },

  _renderSidebar() {
    const list = document.getElementById('distill-adr-list');
    if (!list) return;

    if (allAdrs.length === 0) {
      list.innerHTML = '<div class="distill-content-empty">No ADRs found</div>';
      return;
    }

    const sorted = [...allAdrs].sort((a, b) => a.number - b.number);
    list.innerHTML = sorted.map(adr => {
      const suggestions = this._suggestions[adr.id] || [];
      const count = suggestions.length;
      const isSelected = adr.id === this._selectedAdrId;
      const isLoading = this._loading[adr.id];
      const isClean = !isLoading && adr.id in this._suggestions && count === 0;
      return `
        <div class="distill-adr-item${isSelected ? ' selected' : ''}${count > 0 ? ' has-suggestions' : ''}${isClean ? ' is-clean' : ''}" data-adr-id="${adr.id}">
          <div class="distill-adr-item-info">
            <div class="distill-adr-item-id">${escapeHtml(adr.id)}</div>
            <div class="distill-adr-item-title">${escapeHtml(adr.title)}</div>
          </div>
          ${isLoading ? '<div class="insights-spinner"></div>' : ''}
          ${count > 0 ? `<span class="distill-adr-item-badge">${count}</span>` : ''}
          ${isClean ? '<span class="distill-adr-item-clean">&#10003;</span>' : ''}
        </div>
      `;
    }).join('');

    list.querySelectorAll('.distill-adr-item').forEach(item => {
      item.addEventListener('click', () => {
        this._selectAdr(item.dataset.adrId);
      });
    });
  },

  _selectAdr(adrId) {
    this._selectedAdrId = adrId;
    this._renderSidebar();
    const body = document.getElementById('distill-content-body');
    if (body) body.scrollTop = 0;
    if (!this._suggestions[adrId] && !this._loading[adrId]) {
      vscode.postMessage({ type: 'analyzeDistill', adrId });
    }
    this._renderContent(adrId);
  },

  async _renderContent(adrId) {
    const header = document.getElementById('distill-content-header');
    const body = document.getElementById('distill-content-body');
    const idEl = document.getElementById('distill-content-id');
    const titleEl = document.getElementById('distill-content-title');
    const countEl = document.getElementById('distill-content-count');
    const applyAllBtn = document.getElementById('distill-content-apply-all');
    if (!body) return;

    const adr = allAdrs.find(a => a.id === adrId);
    if (!adr) {
      body.innerHTML = '<div class="distill-content-empty">ADR not found</div>';
      return;
    }

    if (header) header.style.display = 'flex';
    if (idEl) idEl.textContent = adr.id;
    if (titleEl) titleEl.textContent = adr.title;

    const suggestions = this._suggestions[adrId] || [];
    if (countEl) {
      countEl.textContent = this._loading[adrId]
        ? 'Analyzing...'
        : `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}`;
    }
    if (applyAllBtn) applyAllBtn.style.display = suggestions.length > 0 ? '' : 'none';

    // Render markdown with inline highlights
    // Key: search for targets in the RAW markdown (where the LLM found them),
    // inject HTML markers, then let marked parse the whole thing.
    let rawContent = adr.content || '';

    if (suggestions.length > 0) {
      // Find fenced code block regions so we can skip highlighting inside them
      const codeRegions = [];
      const codeRegex = /^(`{3,}|~{3,}).*\n[\s\S]*?\n\1/gm;
      let cm;
      while ((cm = codeRegex.exec(rawContent)) !== null) {
        codeRegions.push({ start: cm.index, end: cm.index + cm[0].length });
      }
      function isInsideCodeBlock(pos, len) {
        for (const r of codeRegions) {
          if (pos >= r.start && pos + len <= r.end) return true;
          // Overlaps with code block
          if (pos < r.end && pos + len > r.start) return true;
        }
        return false;
      }

      // Find targets in raw markdown, sort by position descending
      const injections = [];
      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        const pos = rawContent.indexOf(s.target);
        if (pos === -1) continue;
        if (isInsideCodeBlock(pos, s.target.length)) continue;
        injections.push({ pos, len: s.target.length, suggestion: s, num: i + 1 });
      }
      injections.sort((a, b) => b.pos - a.pos);

      for (const inj of injections) {
        const s = inj.suggestion;
        const before = rawContent.slice(0, inj.pos);
        const target = rawContent.slice(inj.pos, inj.pos + inj.len);
        const after = rawContent.slice(inj.pos + inj.len);

        // Build a block-level card div (marked passes HTML blocks through)
        const card = '\n\n<div class="distill-inline-card severity-' + s.severity + '" data-suggestion-id="' + s.id + '">' +
          '<div class="distill-item-header">' +
            '<span class="distill-suggestion-num">' + inj.num + '</span>' +
            '<span class="distill-category">' + (DISTILL_CATEGORY_LABELS[s.category] || s.category) + '</span>' +
            '<span class="distill-severity distill-severity-' + s.severity + '">' + s.severity + '</span>' +
            '<button class="distill-apply-btn" data-adr-id="' + adrId + '" data-suggestion-id="' + s.id + '">Apply</button>' +
          '</div>' +
          '<div class="distill-reason">' + escapeHtml(s.reason) + '</div>' +
          (s.replacement
            ? '<div class="distill-replacement">Replace with: &quot;' + escapeHtml(truncate(s.replacement, 200)) + '&quot;</div>'
            : '<div class="distill-replacement delete">Will be removed</div>') +
        '</div>\n\n';

        // Wrap the target in <mark> (inline HTML — marked preserves it)
        rawContent = before +
          '<mark class="distill-highlight">' + target + '</mark>' +
          card +
          after;
      }
    }

    const html = await marked.parse(rawContent);
    const overlayHtml = this._loading[adrId]
      ? '<div class="distill-overlay"><div class="distill-overlay-label"><div class="insights-spinner"></div> Analyzing...</div></div>'
      : '';
    body.innerHTML = `${overlayHtml}<div class="distill-rendered-content">${html}</div>`;

    // Render mermaid blocks
    const mermaidBlocks = body.querySelectorAll('code.language-mermaid');
    for (const block of mermaidBlocks) {
      const pre = block.parentElement;
      if (!pre || pre.tagName !== 'PRE') continue;
      const mermaidCode = block.textContent || '';
      const containerId = `distill-mermaid-${++mermaidId}`;
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.id = containerId;
      try {
        const { svg } = await mermaid.default.render(containerId, mermaidCode);
        div.innerHTML = svg;
      } catch (e) {
        div.innerHTML = `<pre style="color:#ef4444;font-size:11px">Mermaid render error: ${escapeHtml(String(e))}</pre>`;
      }
      pre.replaceWith(div);
    }

    // Wire apply buttons
    body.querySelectorAll('.distill-apply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          type: 'applyDistill',
          adrId: e.target.dataset.adrId,
          suggestionId: e.target.dataset.suggestionId,
        });
      });
    });

    // Click badge → scroll to card
    body.querySelectorAll('.distill-highlight-badge').forEach(badge => {
      badge.addEventListener('click', () => {
        const mark = badge.closest('.distill-highlight');
        if (!mark) return;
        const card = mark.nextElementSibling;
        if (card && card.classList.contains('distill-inline-card')) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });

    if (suggestions.length === 0 && !this._loading[adrId]) {
      body.innerHTML = '<div class="distill-clean-banner"><span class="distill-clean-icon">&#10003;</span><span class="distill-clean-title">All clear</span><span class="distill-clean-subtitle">No suggestions — this ADR looks clean.</span></div>' + body.innerHTML;
    }
  },
};

// ===== Message Handling =====
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'update') {
    allAdrs = msg.adrs || [];
    allEdges = msg.edges || [];
    healthReport = msg.health || null;
    HealthDashboard.render(healthReport);
    Analytics.update(msg.lifecycle || null);
    Distill.updateAdrs();
    renderGraphToolbarLists();
    applyFilters();
  } else if (msg.type === 'insights') {
    allInsights = msg.insights || [];
    renderGraphToolbarLists();
  } else if (msg.type === 'insightsLoading') {
    insightsLoading = msg.loading;
    renderGraphToolbarLists();
  } else if (msg.type === 'distillSuggestions') {
    Distill.onSuggestions(msg.adrId, msg.suggestions || []);
  } else if (msg.type === 'distillLoading') {
    Distill.onLoadingChange(msg.adrId, msg.loading);
  } else if (msg.type === 'distillAll') {
    Distill.onBulkResults(msg.reports || []);
  } else if (msg.type === 'distillAllLoading') {
    Distill.onBulkLoadingChange(msg.loading);
  } else if (msg.type === 'distillAllProgress') {
    Distill.onProgress(msg.completed, msg.total);
  } else if (msg.type === 'focusNode') {
    Graph.focusNode(msg.adrId);
  }
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.addEventListener('input', onSearchInput);

  const graphContainer = document.getElementById('graph-container');
  if (graphContainer) Graph.init(graphContainer);

  initGraphToolbar();
  HealthDashboard.init();
  Analytics.init();
  Distill.init();
  // Impact radius slider
  const impactSlider = document.getElementById('impact-radius-slider');
  const impactValue = document.getElementById('impact-radius-value');
  if (impactSlider) {
    impactSlider.addEventListener('input', (e) => {
      impactRadius = parseInt(e.target.value, 10);
      if (impactValue) impactValue.textContent = impactRadius;
      Graph.updateStyles();
    });
  }

  Resizer.init();

  // Preview close button
  const previewCloseBtn = document.getElementById('preview-close-btn');
  if (previewCloseBtn) {
    previewCloseBtn.addEventListener('click', () => {
      selectedAdrId = null;
      Preview.close();
      Timeline.updateSelection(null);
      Graph._selectedNodeId = null;
      Graph.updateStyles();
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    if (graphGroupListOpen || graphFilterListOpen) {
      graphGroupListOpen = false;
      graphFilterListOpen = false;
      renderGraphToolbarLists();
    }
  });

  vscode.postMessage({ type: 'ready' });
});
