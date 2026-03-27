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

      return `
        <div class="timeline-entry${isSelected ? ' selected' : ''}${statusClass}" data-adr-id="${escapeHtml(adr.id)}" title="${escapeHtml(adr.status.toUpperCase())} — #${escapeHtml(adr.id)} ${escapeHtml(adr.title)}">
          <div class="entry-number">${escapeHtml(adr.id.replace(/^ADR-/i, ''))}</div>
          <div class="entry-dot-container">
            <div class="entry-dot ${adr.status}"></div>
          </div>
          <div class="entry-content">
            <span class="entry-title">${escapeHtml(adr.title)}</span>
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
        links.push({ source: edge.source, target: edge.target, type: edge.type });
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
      .attr('stroke', '#888')
      .attr('stroke-opacity', 1)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6,4')
      .attr('marker-end', 'url(#arrow-default)');

    // Link labels
    this._linkTextSel = this._g.append('g').selectAll('text')
      .data(links)
      .join('text')
      .attr('font-size', '9px')
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .style('pointer-events', 'none')
      .attr('font-family', "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Consolas', monospace")
      .text(d => d.type);

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
      .attr('r', 14)
      .attr('fill', d => getStatusColor(d.status))
      .attr('stroke', '#1a1b1e')
      .attr('stroke-width', 2)
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

    if (this._linkSel) {
      this._linkSel.each(function (d) {
        const isActive = d.source.id === selectedId || d.target.id === selectedId ||
                         d.source.id === hoveredId || d.target.id === hoveredId;
        const el = select(this);
        el.attr('stroke', isActive ? '#fff' : '#888')
          .attr('stroke-opacity', isActive ? 1 : 1)
          .attr('stroke-width', isActive ? 2.5 : 2)
          .attr('marker-end', isActive ? 'url(#arrow-selected)' : 'url(#arrow-default)')
          .style('animation', isActive ? 'dash 1s linear infinite' : 'none');
      });
    }

    if (this._nodeSel) {
      this._nodeSel.each(function (d) {
        const isFocused = d.id === selectedId || d.id === hoveredId;
        const isDimmed = d.status === 'superseded' || d.status === 'deprecated';
        select(this)
          .style('opacity', isFocused ? 1 : (isDimmed ? 0.4 : 1));
        select(this).select('circle')
          .attr('stroke', isFocused ? '#fff' : '#1a1b1e')
          .attr('stroke-width', isFocused ? 3 : 2)
          .style('filter', isFocused ? 'drop-shadow(0 0 8px rgba(255,255,255,0.4))' : 'none');
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

function initGraphToolbar() {
  // Group toggle
  const groupToggle = document.getElementById('graph-group-toggle');
  if (groupToggle) {
    groupToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      graphGroupListOpen = !graphGroupListOpen;
      graphFilterListOpen = false;
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
      renderGraphToolbarLists();
    });
  }

  // Prevent clicks inside lists from closing them
  document.getElementById('graph-group-tag-list')?.addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('graph-filter-tag-list')?.addEventListener('click', (e) => e.stopPropagation());
}

function renderGraphToolbarLists() {
  renderGraphGroupTagList();
  renderGraphFilterTagList();
  renderGroupLegend();

  // Update toggle active states
  const groupToggle = document.getElementById('graph-group-toggle');
  const filterToggle = document.getElementById('graph-filter-toggle');
  if (groupToggle) {
    groupToggle.classList.toggle('active', groupByTags.size > 0);
    groupToggle.classList.toggle('open', graphGroupListOpen);
  }
  if (filterToggle) {
    filterToggle.classList.toggle('active', activeTags.size > 0);
    filterToggle.classList.toggle('open', graphFilterListOpen);
  }

  // Update badge counts
  const groupCount = document.getElementById('graph-group-count');
  const filterCount = document.getElementById('graph-filter-count');
  if (groupCount) {
    groupCount.textContent = groupByTags.size || '';
    groupCount.style.display = groupByTags.size > 0 ? 'inline-block' : 'none';
  }
  if (filterCount) {
    filterCount.textContent = activeTags.size || '';
    filterCount.style.display = activeTags.size > 0 ? 'inline-block' : 'none';
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
  const { adrs, edges } = getFilteredData();
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

// ===== Message Handling =====
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'update') {
    allAdrs = msg.adrs || [];
    allEdges = msg.edges || [];
    renderGraphToolbarLists();
    applyFilters();
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
