import { AdrRecord, AdrEdge } from './types';

export type TensionSeverity = 'high' | 'medium' | 'low';

export interface Tension {
  id: string;
  type: 'tag-contradiction' | 'temporal-drift' | 'circular-dependency' | 'competing-proposals' | 'zombie';
  severity: TensionSeverity;
  title: string;
  description: string;
  adrIds: string[];
}

// Known opposing tag pairs
const CONTRADICTING_TAGS: [string, string][] = [
  ['monolith', 'microservices'],
  ['sql', 'nosql'],
  ['rest', 'graphql'],
  ['serverless', 'containers'],
  ['on-premise', 'cloud'],
  ['synchronous', 'asynchronous'],
  ['centralized', 'decentralized'],
  ['spa', 'mpa'],
  ['ssr', 'csr'],
];

export function detectTensions(adrs: AdrRecord[], edges: AdrEdge[]): Tension[] {
  const tensions: Tension[] = [];

  tensions.push(...detectTagContradictions(adrs));
  tensions.push(...detectTemporalDrift(adrs, edges));
  tensions.push(...detectCircularDependencies(adrs, edges));
  tensions.push(...detectCompetingProposals(adrs));
  tensions.push(...detectZombieDecisions(adrs, edges));

  return tensions;
}

function detectTagContradictions(adrs: AdrRecord[]): Tension[] {
  const tensions: Tension[] = [];
  const acceptedAdrs = adrs.filter(a => a.status === 'accepted');

  for (const [tagA, tagB] of CONTRADICTING_TAGS) {
    const withTagA = acceptedAdrs.filter(a => a.tags.some(t => t.toLowerCase() === tagA));
    const withTagB = acceptedAdrs.filter(a => a.tags.some(t => t.toLowerCase() === tagB));

    if (withTagA.length > 0 && withTagB.length > 0) {
      const allIds = [...new Set([...withTagA.map(a => a.id), ...withTagB.map(a => a.id)])];
      tensions.push({
        id: `tag-contradiction-${tagA}-${tagB}`,
        type: 'tag-contradiction',
        severity: 'high',
        title: `Contradicting approaches: ${tagA} vs ${tagB}`,
        description: `Accepted decisions use both "${tagA}" and "${tagB}" tags`,
        adrIds: allIds,
      });
    }
  }

  return tensions;
}

function detectTemporalDrift(adrs: AdrRecord[], edges: AdrEdge[]): Tension[] {
  const tensions: Tension[] = [];
  const adrMap = new Map(adrs.map(a => [a.id, a]));
  const amendEdges = edges.filter(e => e.type === 'amends');

  for (const edge of amendEdges) {
    const source = adrMap.get(edge.source);
    const target = adrMap.get(edge.target);
    if (!source || !target) continue;

    const sourceDate = new Date(source.date);
    const targetDate = new Date(target.date);
    const monthsDiff = (sourceDate.getFullYear() - targetDate.getFullYear()) * 12 +
                       (sourceDate.getMonth() - targetDate.getMonth());

    if (monthsDiff > 12) {
      tensions.push({
        id: `temporal-drift-${edge.source}-${edge.target}`,
        type: 'temporal-drift',
        severity: 'medium',
        title: `${edge.source} amends old decision ${edge.target}`,
        description: `Amending a decision from ${Math.round(monthsDiff)} months ago — consider superseding instead`,
        adrIds: [edge.source, edge.target],
      });
    }
  }

  return tensions;
}

function detectCircularDependencies(_adrs: AdrRecord[], edges: AdrEdge[]): Tension[] {
  const tensions: Tension[] = [];
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of adjacency.get(node) || []) {
      dfs(neighbor, [...path]);
    }

    inStack.delete(node);
  }

  for (const node of adjacency.keys()) {
    dfs(node, []);
  }

  if (cycles.length > 0) {
    // Deduplicate cycles
    const seen = new Set<string>();
    for (const cycle of cycles) {
      const key = [...cycle].sort().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      tensions.push({
        id: `circular-${key}`,
        type: 'circular-dependency',
        severity: 'high',
        title: `Circular dependency: ${cycle.join(' → ')}`,
        description: 'Relationship cycle detected between these ADRs',
        adrIds: cycle,
      });
    }
  }

  return tensions;
}

function detectCompetingProposals(adrs: AdrRecord[]): Tension[] {
  const tensions: Tension[] = [];
  const proposed = adrs.filter(a => a.status === 'proposed');

  if (proposed.length < 2) return tensions;

  // Group proposed ADRs by overlapping tags
  const tagGroups = new Map<string, AdrRecord[]>();
  for (const adr of proposed) {
    for (const tag of adr.tags) {
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag)!.push(adr);
    }
  }

  const reported = new Set<string>();
  for (const [tag, group] of tagGroups) {
    if (group.length < 2) continue;
    const key = group.map(a => a.id).sort().join(',');
    if (reported.has(key)) continue;
    reported.add(key);

    tensions.push({
      id: `competing-${key}`,
      type: 'competing-proposals',
      severity: 'medium',
      title: `${group.length} competing proposals for "${tag}"`,
      description: `Multiple proposed ADRs share the "${tag}" tag`,
      adrIds: group.map(a => a.id),
    });
  }

  return tensions;
}

function detectZombieDecisions(adrs: AdrRecord[], edges: AdrEdge[]): Tension[] {
  const tensions: Tension[] = [];
  const supersededTargets = new Set(
    edges.filter(e => e.type === 'supersedes').map(e => e.target)
  );

  const deprecated = adrs.filter(a => a.status === 'deprecated');
  for (const adr of deprecated) {
    if (!supersededTargets.has(adr.id)) {
      tensions.push({
        id: `zombie-${adr.id}`,
        type: 'zombie',
        severity: 'high',
        title: `Zombie: ${adr.id} deprecated without replacement`,
        description: 'This decision is deprecated but no ADR supersedes it',
        adrIds: [adr.id],
      });
    }
  }

  return tensions;
}
