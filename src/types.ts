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
  content: string;
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
  /** Decisions per month: { month: 'YYYY-MM', count: number }[] */
  velocity: { month: string; count: number }[];
  /** Status distribution funnel */
  funnel: { proposed: number; accepted: number; amended: number; superseded: number; deprecated: number };
  /** Tag stability: lower churn = more stable */
  tagStability: { tag: string; total: number; churned: number; stability: number }[];
}

export type ExtensionToWebviewMessage =
  | { type: 'update'; adrs: AdrRecord[]; edges: AdrEdge[]; health: HealthReportMsg; lifecycle: LifecycleMetrics }
  | { type: 'insights'; insights: InsightMsg[] }
  | { type: 'insightsLoading'; loading: boolean }
  | { type: 'focusNode'; adrId: string }
  | { type: 'distillSuggestions'; adrId: string; suggestions: DistillSuggestion[] }
  | { type: 'distillLoading'; adrId: string; loading: boolean }
  | { type: 'distillAll'; reports: DistillReport[] }
  | { type: 'distillAllLoading'; loading: boolean }
  | { type: 'distillAllProgress'; completed: number; total: number };

export type WebviewToExtensionMessage =
  | { type: 'openFile'; filePath: string }
  | { type: 'requestData' }
  | { type: 'analyzeInsights' }
  | { type: 'analyzeDistill'; adrId: string }
  | { type: 'analyzeDistillAll' }
  | { type: 'applyDistill'; adrId: string; suggestionId: string }
  | { type: 'applyDistillAll'; adrId: string }
  | { type: 'ready' };
