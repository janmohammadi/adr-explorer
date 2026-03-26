const { select } = require('d3-selection');
const { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } = require('d3-force');
const { zoom: d3Zoom, zoomIdentity } = require('d3-zoom');
const { drag: d3Drag } = require('d3-drag');

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ===== State =====
let allAdrs = [];
let allEdges = [];
let searchQuery = '';
let statusFilter = 'ALL';

// ===== Filtering =====
function getFilteredData() {
  const query = searchQuery.toLowerCase();
  const filteredAdrs = allAdrs.filter(adr => {
    const matchesSearch = !query ||
      adr.title.toLowerCase().includes(query) ||
      adr.id.toLowerCase().includes(query) ||
      (adr.tags && adr.tags.some(t => t.toLowerCase().includes(query)));
    const matchesStatus = statusFilter === 'ALL' || adr.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const filteredIds = new Set(filteredAdrs.map(a => a.id));
  const filteredEdges = allEdges.filter(e => filteredIds.has(e.source) && filteredIds.has(e.target));
  return { adrs: filteredAdrs, edges: filteredEdges };
}

// ===== Timeline Module =====
const Timeline = {
  render(adrs) {
    const container = document.getElementById('timeline-entries');
    if (!container) return;

    if (adrs.length === 0) {
      container.innerHTML = '<div class="timeline-empty">No records match your search criteria.</div>';
      return;
    }

    const sorted = [...adrs].sort((a, b) => b.date.localeCompare(a.date));

    container.innerHTML = sorted.map((adr, index) => {
      const tagsHtml = (adr.tags || []).map(t =>
        `<span class="meta-tag">"${escapeHtml(t)}"</span>`
      ).join(' ');

      return `
        <div class="timeline-entry" data-filepath="${escapeHtml(adr.filePath || '')}">
          <div class="entry-number">${(index + 1).toString().padStart(2, '0')}</div>
          <div class="entry-dot-container">
            <div class="entry-dot ${adr.status}"></div>
          </div>
          <div class="entry-content">
            <div class="entry-header">
              <span class="entry-id">#${escapeHtml(adr.id)}</span>
              <span class="entry-title">${escapeHtml(adr.title)}</span>
            </div>
            <div class="entry-meta">
              <span><span class="meta-label">date:</span> <span class="meta-value">${escapeHtml(adr.date)}</span></span>
              ${tagsHtml ? `<span><span class="meta-label">tags:</span> ${tagsHtml}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.timeline-entry').forEach(item => {
      item.addEventListener('click', () => {
        const filePath = item.getAttribute('data-filepath');
        if (filePath) {
          vscode.postMessage({ type: 'openFile', filePath });
        }
      });
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
  _container: null,
  _width: 0,
  _height: 0,
  _selectedNodeId: null,
  _hoveredNodeId: null,

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
        .attr('fill', id === 'arrow-selected' ? '#fff' : '#666')
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
      this._selectedNodeId = null;
      this.updateStyles();
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

    edges.forEach(edge => {
      const sourceExists = nodes.find(n => n.id === edge.source);
      const targetExists = nodes.find(n => n.id === edge.target);
      if (sourceExists && targetExists) {
        links.push({ source: edge.source, target: edge.target, type: edge.type });
      }
    });

    // Force simulation
    const simulation = forceSimulation(nodes)
      .force('link', forceLink(links).id(d => d.id).distance(120))
      .force('charge', forceManyBody().strength(-500))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collision', forceCollide().radius(40));

    this._simulation = simulation;

    // Links
    const linkGroup = this._g.append('g').attr('class', 'links-group');
    this._linkSel = linkGroup.selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'adr-link')
      .attr('stroke', '#444')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '5,5')
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
        self._selectedNodeId = self._selectedNodeId === d.id ? null : d.id;
        self.updateStyles();
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
          event.subject.fx = null;
          event.subject.fy = null;
        })
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
        // Extract short ID: "ADR-0001" -> "001", or just use as-is if short
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
    });

    // Open file on double-click
    this._nodeSel.on('dblclick', (event, d) => {
      event.stopPropagation();
      if (d.filePath) {
        vscode.postMessage({ type: 'openFile', filePath: d.filePath });
      }
    });
  },

  updateStyles() {
    const selectedId = this._selectedNodeId;
    const hoveredId = this._hoveredNodeId;

    if (this._linkSel) {
      this._linkSel.each(function (d) {
        const isActive = d.source.id === selectedId || d.target.id === selectedId ||
                         d.source.id === hoveredId || d.target.id === hoveredId;
        const el = select(this);
        el.attr('stroke', isActive ? '#fff' : '#444')
          .attr('stroke-opacity', isActive ? 1 : 0.4)
          .attr('stroke-width', isActive ? 2 : 1)
          .attr('marker-end', isActive ? 'url(#arrow-selected)' : 'url(#arrow-default)')
          .style('animation', isActive ? 'dash 1s linear infinite' : 'none');
      });
    }

    if (this._nodeSel) {
      this._nodeSel.each(function (d) {
        const isFocused = d.id === selectedId || d.id === hoveredId;
        select(this).select('circle')
          .attr('stroke', isFocused ? '#fff' : '#1a1b1e')
          .attr('stroke-width', isFocused ? 3 : 2)
          .style('filter', isFocused ? 'drop-shadow(0 0 8px rgba(255,255,255,0.4))' : 'none');
      });
    }
  },

  focusNode(adrId) {
    if (!this._nodeSel || !this._svg) return;
    this._selectedNodeId = adrId;
    this.updateStyles();

    // Find the node data
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

// ===== Search & Filter =====
let searchTimeout = null;

function onSearchInput(e) {
  searchQuery = e.target.value;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(applyFilters, 200);
}

function onStatusFilterChange(e) {
  statusFilter = e.target.value;
  applyFilters();
}

function applyFilters() {
  const { adrs, edges } = getFilteredData();
  const countEl = document.getElementById('record-count');
  if (countEl) {
    countEl.textContent = `${adrs.length} of ${allAdrs.length} records`;
  }
  Timeline.render(adrs);
  Graph.render(adrs, edges);
}

// ===== Message Handling =====
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'update') {
    allAdrs = msg.adrs || [];
    allEdges = msg.edges || [];
    applyFilters();
  } else if (msg.type === 'focusNode') {
    Graph.focusNode(msg.adrId);
  }
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const statusSelect = document.getElementById('status-filter');

  if (searchInput) searchInput.addEventListener('input', onSearchInput);
  if (statusSelect) statusSelect.addEventListener('change', onStatusFilterChange);

  const graphContainer = document.getElementById('graph-container');
  if (graphContainer) Graph.init(graphContainer);

  vscode.postMessage({ type: 'ready' });
});
