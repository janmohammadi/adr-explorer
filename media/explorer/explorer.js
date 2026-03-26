const { select } = require('d3-selection');
const { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } = require('d3-force');
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

// ===== Tag Chips =====
function renderTagChips() {
  const container = document.getElementById('tag-chips');
  if (!container) return;

  // Collect tags with counts
  const tagCounts = {};
  for (const adr of allAdrs) {
    if (adr.tags) {
      for (const tag of adr.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  const sortedTags = Object.keys(tagCounts).sort();
  container.innerHTML = sortedTags.map(tag => {
    const isActive = activeTags.has(tag);
    return `<button class="tag-chip${isActive ? ' active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}<span class="tag-chip-count">${tagCounts[tag]}</span></button>`;
  }).join('');

  container.querySelectorAll('.tag-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.getAttribute('data-tag');
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      renderTagChips();
      applyFilters();
    });
  });
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
    if (panel) panel.classList.remove('open');
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

    const sorted = [...adrs].sort((a, b) => b.date.localeCompare(a.date));

    container.innerHTML = sorted.map((adr, index) => {
      const tagsHtml = (adr.tags || []).map(t =>
        `<span class="meta-tag">"${escapeHtml(t)}"</span>`
      ).join(' ');
      const isSelected = adr.id === selectedAdrId;
      const statusClass = (adr.status === 'superseded' || adr.status === 'deprecated') ? ` status-${adr.status}` : '';

      return `
        <div class="timeline-entry${isSelected ? ' selected' : ''}${statusClass}" data-adr-id="${escapeHtml(adr.id)}">
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
          event.subject.fx = null;
          event.subject.fy = null;
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

function renderStatusChips() {
  const container = document.getElementById('status-chips');
  if (!container) return;
  const statuses = ['proposed', 'accepted', 'deprecated', 'superseded'];
  container.innerHTML = statuses.map(s => {
    const isActive = activeStatuses.has(s);
    return `<button class="status-chip${isActive ? ' active' : ''}" data-status="${s}"><span class="status-chip-dot ${s}"></span>${s.toUpperCase()}</button>`;
  }).join('');
  container.querySelectorAll('.status-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.getAttribute('data-status');
      if (activeStatuses.has(s)) { activeStatuses.delete(s); } else { activeStatuses.add(s); }
      renderStatusChips();
      applyFilters();
    });
  });
}

function applyFilters() {
  const { adrs, edges } = getFilteredData();
  const countEl = document.getElementById('record-count');
  if (countEl) {
    countEl.textContent = `${adrs.length} of ${allAdrs.length} records`;
  }
  Timeline.render(adrs);
  Graph.render(adrs, edges);

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
    renderTagChips();
    applyFilters();
  } else if (msg.type === 'focusNode') {
    Graph.focusNode(msg.adrId);
  }
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.addEventListener('input', onSearchInput);

  renderStatusChips();

  const graphContainer = document.getElementById('graph-container');
  if (graphContainer) Graph.init(graphContainer);

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

  vscode.postMessage({ type: 'ready' });
});
