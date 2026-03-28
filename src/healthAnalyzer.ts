import { AdrRecord, AdrEdge } from './types';

export type HealthSeverity = 'critical' | 'warning' | 'info';

export interface HealthIssue {
  id: string;
  severity: HealthSeverity;
  title: string;
  description: string;
  adrIds: string[];
}

export interface HealthReport {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: HealthIssue[];
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

const STALE_MONTHS = 12;

function monthsSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

export function analyzeHealth(adrs: AdrRecord[], edges: AdrEdge[]): HealthReport {
  const issues: HealthIssue[] = [];

  const stats = {
    total: adrs.length,
    proposed: 0,
    accepted: 0,
    deprecated: 0,
    superseded: 0,
    orphans: 0,
    stale: 0,
    missingDeciders: 0,
  };

  // Count statuses
  for (const adr of adrs) {
    if (adr.status in stats) {
      (stats as Record<string, number>)[adr.status]++;
    }
  }

  // Build adjacency set for orphan detection
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }

  // Check each ADR
  const staleAdrs: string[] = [];
  const orphanAdrs: string[] = [];
  const missingDeciderAdrs: string[] = [];
  const longProposedAdrs: string[] = [];

  for (const adr of adrs) {
    // Stale check: accepted ADRs older than STALE_MONTHS
    if (adr.status === 'accepted' && monthsSince(adr.date) > STALE_MONTHS) {
      staleAdrs.push(adr.id);
    }

    // Orphan check: no edges and more than 1 ADR total
    if (adrs.length > 1 && !connected.has(adr.id) && adr.relatesTo.length === 0 && adr.supersedes.length === 0 && adr.amends.length === 0) {
      orphanAdrs.push(adr.id);
    }

    // Missing deciders
    if (!adr.deciders || adr.deciders.length === 0) {
      missingDeciderAdrs.push(adr.id);
    }

    // Long-standing proposals (> 3 months)
    if (adr.status === 'proposed' && monthsSince(adr.date) > 3) {
      longProposedAdrs.push(adr.id);
    }
  }

  stats.stale = staleAdrs.length;
  stats.orphans = orphanAdrs.length;
  stats.missingDeciders = missingDeciderAdrs.length;

  // Detect supersession chains (length >= 3)
  const supersessionChains = detectSupersessionChains(adrs, edges);

  // Detect zombie decisions (deprecated with no superseding replacement)
  const zombieAdrs = detectZombies(adrs, edges);

  // Build issues
  if (staleAdrs.length > 0) {
    issues.push({
      id: 'stale',
      severity: 'warning',
      title: `${staleAdrs.length} stale decision${staleAdrs.length > 1 ? 's' : ''}`,
      description: `Accepted ADRs older than ${STALE_MONTHS} months without review`,
      adrIds: staleAdrs,
    });
  }

  if (orphanAdrs.length > 0) {
    issues.push({
      id: 'orphans',
      severity: 'info',
      title: `${orphanAdrs.length} isolated decision${orphanAdrs.length > 1 ? 's' : ''}`,
      description: 'ADRs with no relationships to other decisions',
      adrIds: orphanAdrs,
    });
  }

  if (missingDeciderAdrs.length > 0) {
    issues.push({
      id: 'missing-deciders',
      severity: 'warning',
      title: `${missingDeciderAdrs.length} decision${missingDeciderAdrs.length > 1 ? 's' : ''} without deciders`,
      description: 'ADRs missing assigned decision makers',
      adrIds: missingDeciderAdrs,
    });
  }

  if (longProposedAdrs.length > 0) {
    issues.push({
      id: 'long-proposed',
      severity: 'critical',
      title: `${longProposedAdrs.length} stalled proposal${longProposedAdrs.length > 1 ? 's' : ''}`,
      description: 'Proposed ADRs pending for over 3 months',
      adrIds: longProposedAdrs,
    });
  }

  if (supersessionChains.length > 0) {
    issues.push({
      id: 'supersession-chains',
      severity: 'warning',
      title: `${supersessionChains.length} long supersession chain${supersessionChains.length > 1 ? 's' : ''}`,
      description: 'Chains of 3+ superseded ADRs may signal architectural instability',
      adrIds: supersessionChains.flat(),
    });
  }

  if (zombieAdrs.length > 0) {
    issues.push({
      id: 'zombies',
      severity: 'critical',
      title: `${zombieAdrs.length} zombie decision${zombieAdrs.length > 1 ? 's' : ''}`,
      description: 'Deprecated ADRs with no superseding replacement',
      adrIds: zombieAdrs,
    });
  }

  // Calculate score
  const score = calculateScore(adrs, issues);
  const grade = scoreToGrade(score);

  return { score, grade, issues, stats };
}

function detectSupersessionChains(adrs: AdrRecord[], edges: AdrEdge[]): string[][] {
  const supersedes = new Map<string, string>();
  for (const edge of edges) {
    if (edge.type === 'supersedes') {
      supersedes.set(edge.source, edge.target);
    }
  }

  const chains: string[][] = [];
  const visited = new Set<string>();

  for (const adr of adrs) {
    if (visited.has(adr.id)) continue;
    const chain: string[] = [adr.id];
    let current = adr.id;
    visited.add(current);

    while (supersedes.has(current)) {
      current = supersedes.get(current)!;
      if (visited.has(current)) break;
      visited.add(current);
      chain.push(current);
    }

    if (chain.length >= 3) {
      chains.push(chain);
    }
  }

  return chains;
}

function detectZombies(adrs: AdrRecord[], edges: AdrEdge[]): string[] {
  const supersededTargets = new Set(
    edges.filter(e => e.type === 'supersedes').map(e => e.target)
  );
  const deprecatedIds = adrs
    .filter(a => a.status === 'deprecated')
    .map(a => a.id);

  return deprecatedIds.filter(id => !supersededTargets.has(id));
}

function calculateScore(adrs: AdrRecord[], issues: HealthIssue[]): number {
  if (adrs.length === 0) return 100;

  let deductions = 0;
  for (const issue of issues) {
    const ratio = issue.adrIds.length / adrs.length;
    switch (issue.severity) {
      case 'critical':
        deductions += ratio * 30;
        break;
      case 'warning':
        deductions += ratio * 15;
        break;
      case 'info':
        deductions += ratio * 5;
        break;
    }
  }

  return Math.max(0, Math.round(100 - deductions));
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
