/**
 * Host-neutral builder for the explorer page HTML. Both the VS Code webview
 * host and the CLI HTTP server inject host-specific bits (CSP source, asset
 * URIs, nonce) and reuse the body markup from here.
 */
export function buildExplorerHtml(parts: {
  cspMeta: string;
  cssLinks: string;
  headExtras: string;
  scriptTags: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${parts.cspMeta}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${parts.cssLinks}
  ${parts.headExtras}
  <title>ADR Explorer</title>
</head>
<body>
  <div class="app">
    <div id="empty-state" class="empty-state" style="display:none">
      <div class="empty-state-card">
        <div class="empty-state-title">No ADRs found yet</div>
        <p class="empty-state-body">Start your first decision with <strong>deep-adr</strong> &mdash; a Claude skill bundle that co-thinks the decision with you, pushes back on weak reasoning, and writes the markdown for this explorer to pick up.</p>
        <a class="empty-state-link" href="https://github.com/janmohammadi/deep-adr" target="_blank" rel="noopener noreferrer">Get deep-adr &rarr;</a>
      </div>
    </div>
    <div class="header">
      <div class="header-left">
        <div class="header-search">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input id="search-input" type="text" placeholder="Search ADRs..." />
        </div>
      </div>
      <div class="header-right">
        <button id="refresh-btn" class="header-btn" title="Rescan ADRs from disk">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>
          </svg>
          Refresh
        </button>
        <button id="distill-toggle" class="header-btn" title="Toggle Distill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 3h6l-3 7h4l-5 8 1-5H8z"/>
          </svg>
          Distill
        </button>
        <button id="analytics-toggle" class="header-btn" title="Toggle Analytics">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
          Analytics
        </button>
        <span id="record-count" class="header-count"></span>
      </div>
    </div>
    <div id="health-dashboard" class="health-dashboard collapsed">
      <div class="health-header" id="health-header-toggle">
        <div class="health-header-left">
          <div class="health-grade-badge" id="health-grade">—</div>
          <span class="health-title">Decision Health</span>
          <span class="health-score" id="health-score"></span>
        </div>
        <div class="health-header-right">
          <span class="health-issue-count" id="health-issue-count"></span>
          <svg class="health-chevron" id="health-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>
      <div class="health-body" id="health-body">
        <div class="health-stats" id="health-stats"></div>
        <div class="health-issues" id="health-issues"></div>
      </div>
    </div>
    <div class="main">
      <div class="timeline-panel">
        <div class="timeline-header">
          <div class="timeline-label">
            <div class="label-icon"><div class="label-icon-dot"></div></div>
            ADR Timeline
          </div>
        </div>
        <div class="timeline-content">
          <div class="timeline-line"></div>
          <div id="timeline-entries" class="timeline-entries"></div>
        </div>
      </div>
      <div id="resize-handle-timeline" class="resize-handle"></div>
      <div class="graph-panel grid-background" id="graph-container">
        <div class="graph-label">
          <div class="label-icon"><div class="label-icon-dot"></div></div>
          ADR Graph
        </div>
        <div class="graph-controls">
          <div class="graph-toolbar">
            <button id="graph-filter-toggle" class="graph-toolbar-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>
              </svg>
              Filter
              <span id="graph-filter-count" class="graph-toolbar-badge" style="display:none"></span>
            </button>
            <button id="graph-insights-toggle" class="graph-toolbar-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
                <path d="M20 3v4"/><path d="M22 5h-4"/>
              </svg>
              AI Insights
              <span id="graph-insights-count" class="graph-toolbar-badge" style="display:none"></span>
            </button>
            <button id="graph-group-toggle" class="graph-toolbar-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
              </svg>
              Group
              <span id="graph-group-count" class="graph-toolbar-badge" style="display:none"></span>
            </button>
            <button id="graph-chains-toggle" class="graph-toolbar-btn" title="Supersession chains">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              Chains
              <span id="graph-chains-count" class="graph-toolbar-badge" style="display:none"></span>
            </button>
          </div>
          <div id="impact-radius-control" class="impact-radius-control" style="display:none">
            <label class="impact-radius-label">Impact depth</label>
            <input id="impact-radius-slider" type="range" min="1" max="5" value="2" class="impact-radius-slider">
            <span id="impact-radius-value" class="impact-radius-value">2</span>
          </div>
          <div id="graph-insights-list" class="graph-toolbar-list insights-list"></div>
          <div id="graph-filter-tag-list" class="graph-toolbar-list"></div>
          <div id="graph-group-tag-list" class="graph-toolbar-list"></div>
          <div id="graph-chains-list" class="graph-toolbar-list chains-list"></div>
        </div>
        <div id="graph-group-legend" class="graph-group-legend"></div>
      </div>
      <div id="resize-handle-preview" class="resize-handle resize-handle-preview"></div>
      <div class="preview-panel" id="preview-panel">
        <div class="preview-header">
          <div class="preview-header-left">
            <div class="preview-header-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
              </svg>
              <span id="preview-id" class="preview-header-id"></span>
            </div>
            <span id="preview-title" class="preview-header-title"></span>
          </div>
          <div class="preview-header-actions">
            <button id="preview-edit-btn" class="preview-btn preview-btn-primary" title="Edit ADR inline">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
              </svg>
              Edit
            </button>
            <button id="preview-open-btn" class="preview-btn" title="Open in IDE" style="display:none">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              </svg>
            </button>
            <button id="preview-save-btn" class="preview-btn preview-btn-primary" title="Save changes" style="display:none">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              Save
            </button>
            <button id="preview-cancel-btn" class="preview-btn" title="Discard changes" style="display:none">
              Cancel
            </button>
            <button id="preview-close-btn" class="preview-close" title="Close preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="preview-meta" class="preview-meta"></div>
        <div id="preview-body" class="preview-body"></div>
        <div id="preview-editor" class="preview-editor" style="display:none"></div>
      </div>
    </div>
  </div>
  <div id="analytics-panel" class="analytics-panel" style="display:none">
    <div class="analytics-header">
      <span class="analytics-title">Decision Lifecycle Analytics</span>
      <button id="analytics-close" class="preview-close" title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    </div>
    <div class="analytics-tabs" role="tablist">
      <button class="analytics-tab active" data-tab="overview" role="tab">Overview</button>
      <button class="analytics-tab" data-tab="debt" role="tab">Debt</button>
      <button class="analytics-tab" data-tab="areas" role="tab">Areas</button>
      <button class="analytics-tab" data-tab="people" role="tab">People &amp; Trust</button>
    </div>
    <div class="analytics-body">
      <div class="analytics-tab-panel active" data-panel="overview">
        <div class="analytics-section">
          <div class="analytics-section-title">Status Over Time</div>
          <div class="analytics-section-hint">Cumulative composition of decisions by status</div>
          <div class="analytics-canvas-wrap"><canvas id="status-timeline-chart"></canvas></div>
        </div>
        <div class="analytics-section">
          <div class="analytics-section-title">Decision Velocity</div>
          <div id="velocity-chart" class="analytics-chart"></div>
        </div>
        <div class="analytics-section">
          <div class="analytics-section-title">Lifecycle Funnel</div>
          <div id="funnel-chart" class="analytics-funnel"></div>
        </div>
      </div>
      <div class="analytics-tab-panel" data-panel="debt">
        <div class="analytics-section">
          <div class="analytics-section-title">Decision Debt</div>
          <div class="analytics-section-hint">Reviews that are overdue, expiring soon, expired, or stale</div>
          <div id="debt-kpis" class="analytics-kpi-grid"></div>
        </div>
        <div class="analytics-section">
          <div class="analytics-section-title">Debt by Area</div>
          <div class="analytics-canvas-wrap"><canvas id="debt-by-tag-chart"></canvas></div>
        </div>
      </div>
      <div class="analytics-tab-panel" data-panel="areas">
        <div class="analytics-section">
          <div class="analytics-section-title">Architectural Hotspots</div>
          <div class="analytics-section-hint">Decisions per tag per quarter — darker = more activity</div>
          <div id="hotspots-heatmap" class="hotspot-grid"></div>
        </div>
        <div class="analytics-section">
          <div class="analytics-section-title">Tag Stability</div>
          <div id="stability-chart" class="analytics-stability"></div>
        </div>
      </div>
      <div class="analytics-tab-panel" data-panel="people">
        <div class="analytics-section">
          <div class="analytics-section-title">Ownership</div>
          <div id="ownership-stats" class="decider-stats"></div>
          <div class="analytics-canvas-wrap"><canvas id="ownership-chart"></canvas></div>
        </div>
        <div class="analytics-section">
          <div class="analytics-section-title">Confidence</div>
          <div class="analytics-two-col">
            <div class="analytics-canvas-wrap analytics-canvas-wrap-doughnut"><canvas id="confidence-chart"></canvas></div>
            <div id="confidence-low-accepted" class="confidence-chip-list"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div id="distill-panel" class="distill-panel" style="display:none">
    <div class="distill-panel-header">
      <span class="distill-panel-title">Distill</span>
      <button id="distill-close" class="preview-close" title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    </div>
    <div class="distill-panel-body">
      <div class="distill-sidebar">
        <div class="distill-sidebar-actions">
          <button id="distill-all-btn" class="distill-all-btn">Distill All ADRs</button>
        </div>
        <div id="distill-progress" class="distill-progress" style="display:none"></div>
        <div id="distill-adr-list" class="distill-adr-list"></div>
      </div>
      <div class="distill-content">
        <div id="distill-content-header" class="distill-content-header" style="display:none">
          <div class="distill-content-title-row">
            <span id="distill-content-id" class="distill-content-id"></span>
            <span id="distill-content-title" class="distill-content-title"></span>
          </div>
          <div class="distill-content-actions">
            <span id="distill-content-count" class="distill-content-count"></span>
            <button id="distill-content-apply-all" class="distill-apply-all-btn">Apply All</button>
          </div>
        </div>
        <div id="distill-content-body" class="distill-content-body">
          <div class="distill-content-empty">Select an ADR from the list to view suggestions</div>
        </div>
        <div class="distill-deep-adr-footer">
          Want to critique while you write, not after? Use <a href="https://github.com/janmohammadi/deep-adr" target="_blank" rel="noopener noreferrer">deep-adr</a> skills with Claude.
        </div>
      </div>
    </div>
  </div>
  ${parts.scriptTags}
</body>
</html>`;
}
