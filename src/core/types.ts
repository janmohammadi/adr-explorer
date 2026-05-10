export type AdrStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface RelatesToEntry {
  id: string;
  reason?: string;
}

export interface AdrRecord {
  /** Derived from filename, e.g., "ADR-0001" */
  id: string;
  /** Numeric portion for sorting */
  number: number;
  title: string;
  status: AdrStatus;
  date: string;
  deciders: string[];
  supersedes: string[];
  amends: string[];
  relatesTo: RelatesToEntry[];
  tags: string[];
  filePath: string;
  /** Markdown body with YAML frontmatter stripped (for rendering). */
  content: string;
  /** Full raw file contents including frontmatter (for editing). */
  rawContent: string;
  /** Optional: next review date (YYYY-MM-DD) */
  reviewBy?: string;
  /** Optional: recurring review cycle e.g. "6months", "1year" */
  reviewInterval?: string;
  /** Optional: hard expiry date (YYYY-MM-DD) */
  expires?: string;
  /** Optional: architect's confidence level */
  confidence?: ConfidenceLevel;
  /** Computed: review status */
  reviewStatus?: 'overdue' | 'due-soon' | 'expired' | 'ok';
}

export interface AdrEdge {
  source: string;
  target: string;
  type: 'supersedes' | 'amends' | 'relates-to';
  reason?: string;
}

export interface HealthIssueMsg {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  adrIds: string[];
}

export interface HealthReportMsg {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: HealthIssueMsg[];
  stats: {
    total: number;
    proposed: number;
    accepted: number;
    deprecated: number;
    superseded: number;
    orphans: number;
    stale: number;
    missingDeciders: number;
  };
}

export interface InsightMsg {
  id: string;
  type: 'contradiction' | 'missing-relation' | 'suggested-update' | 'staleness' | 'coherence';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestion: string;
  adrIds: string[];
}

export type DistillCategory =
  | 'verbose-filler'
  | 'redundant-section'
  | 'excessive-alternatives'
  | 'implementation-detail'
  | 'generic-consequence'
  | 'unnecessary-background';

export interface DistillSuggestion {
  id: string;
  category: DistillCategory;
  severity: 'high' | 'medium' | 'low';
  /** The specific text or section to distill */
  target: string;
  /** Why this should be removed or condensed */
  reason: string;
  /** Suggested replacement (empty string means delete entirely) */
  replacement: string;
}

export interface DistillReport {
  adrId: string;
  adrTitle: string;
  suggestions: DistillSuggestion[];
}

export interface LifecycleMetrics {
  velocity: { month: string; count: number }[];
  funnel: { proposed: number; accepted: number; amended: number; superseded: number; deprecated: number };
  tagStability: { tag: string; total: number; churned: number; stability: number }[];
  statusOverTime: { month: string; proposed: number; accepted: number; superseded: number; deprecated: number }[];
  decisionDebt: {
    overdue: number;
    dueSoon: number;
    expired: number;
    stale: number;
    byTag: { tag: string; overdue: number; dueSoon: number; stale: number }[];
  };
  hotspots: { quarters: string[]; rows: { tag: string; counts: number[] }[] };
  ownership: {
    deciders: { name: string; total: number; tags: string[] }[];
    soloAuthoredCount: number;
    totalCount: number;
    busFactorOneTags: string[];
  };
  confidence: { high: number; medium: number; low: number; none: number; lowAcceptedIds: string[] };
  supersessionChains: { chain: string[] }[];
}

/** Capabilities the host advertises to the webview so it can hide UI affordances. */
export interface HostCapabilities {
  aiEnabled: boolean;
  canEditFiles: boolean;
  /** Host can open the underlying file in an external editor (e.g., VS Code). */
  canOpenInEditor: boolean;
}

export type ExtensionToWebviewMessage =
  | { type: 'update'; adrs: AdrRecord[]; edges: AdrEdge[]; health: HealthReportMsg; lifecycle: LifecycleMetrics; capabilities: HostCapabilities }
  | { type: 'insights'; insights: InsightMsg[] }
  | { type: 'insightsLoading'; loading: boolean }
  | { type: 'focusNode'; adrId: string }
  | { type: 'distillSuggestions'; adrId: string; suggestions: DistillSuggestion[] }
  | { type: 'distillLoading'; adrId: string; loading: boolean }
  | { type: 'distillAll'; reports: DistillReport[] }
  | { type: 'distillAllLoading'; loading: boolean }
  | { type: 'distillAllProgress'; completed: number; total: number }
  | { type: 'notify'; level: 'info' | 'warn' | 'error'; message: string };

export type WebviewToExtensionMessage =
  | { type: 'openFile'; filePath: string }
  | { type: 'requestData' }
  | { type: 'analyzeInsights' }
  | { type: 'analyzeDistill'; adrId: string }
  | { type: 'analyzeDistillAll' }
  | { type: 'applyDistill'; adrId: string; suggestionId: string }
  | { type: 'applyDistillAll'; adrId: string }
  | { type: 'openDistillAdr'; adrId: string }
  | { type: 'saveAdr'; filePath: string; content: string }
  | { type: 'ready' };
