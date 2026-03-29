/**
 * Tests for the insight validation layer.
 *
 * Verifies that validateInsights correctly filters out hallucinated
 * "missing-relation" claims when edges already exist in the graph.
 *
 * Run: npx ts-node --skip-project test/insightValidator.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// --- Inline types (avoid importing from src which depends on vscode) ---
interface RelatesToEntry { id: string; reason?: string; }
interface AdrRecord {
  id: string; number: number; title: string; status: string; date: string;
  deciders: string[]; supersedes: string[]; amends: string[]; relatesTo: RelatesToEntry[];
  tags: string[]; filePath: string; content: string;
}
interface AdrEdge { source: string; target: string; type: string; reason?: string; }
interface InsightMsg {
  id: string; type: string; severity: string; title: string;
  description: string; suggestion: string; adrIds: string[];
}

// --- Copy of validateInsights (extracted to avoid vscode dependency) ---
function validateInsights(insights: InsightMsg[], edges: AdrEdge[]): InsightMsg[] {
  const edgeSet = new Set<string>();
  for (const e of edges) {
    edgeSet.add(`${e.source}->${e.target}:${e.type}`);
    if (e.type === 'relates-to') {
      edgeSet.add(`${e.target}->${e.source}:${e.type}`);
    }
  }

  return insights.filter(insight => {
    if (insight.type !== 'missing-relation') return true;
    const ids = insight.adrIds;
    if (ids.length < 2) return true;

    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue;
        if (edgeSet.has(`${ids[i]}->${ids[j]}:supersedes`) ||
            edgeSet.has(`${ids[i]}->${ids[j]}:amends`) ||
            edgeSet.has(`${ids[i]}->${ids[j]}:relates-to`)) {
          return false;
        }
      }
    }
    return true;
  });
}

// --- Copy of buildAdrGraph (extracted to avoid vscode dependency) ---
function buildAdrGraph(adrs: AdrRecord[], edges: AdrEdge[]): object {
  const outgoing = new Map<string, { type: string; target: string; reason?: string }[]>();
  const incoming = new Map<string, { type: string; source: string; reason?: string }[]>();

  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push({ type: e.type, target: e.target, ...(e.reason ? { reason: e.reason } : {}) });
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push({ type: e.type, source: e.source, ...(e.reason ? { reason: e.reason } : {}) });
  }

  return {
    nodes: adrs.map(adr => ({
      id: adr.id, title: adr.title, status: adr.status, date: adr.date,
      tags: adr.tags, deciders: adr.deciders,
      relationships: {
        outgoing: outgoing.get(adr.id) || [],
        incoming: incoming.get(adr.id) || [],
      },
      content: adr.content,
    })),
  };
}

// --- Build edges from ADRs (same logic as adrRepository.getAllEdges) ---
function buildEdges(adrs: AdrRecord[]): AdrEdge[] {
  const edges: AdrEdge[] = [];
  const allIds = new Set(adrs.map(a => a.id));
  for (const adr of adrs) {
    for (const target of adr.supersedes) {
      if (allIds.has(target)) edges.push({ source: adr.id, target, type: 'supersedes' });
    }
    for (const target of adr.amends) {
      if (allIds.has(target)) edges.push({ source: adr.id, target, type: 'amends' });
    }
    for (const rel of adr.relatesTo) {
      if (allIds.has(rel.id)) edges.push({ source: adr.id, target: rel.id, type: 'relates-to', reason: rel.reason });
    }
  }
  return edges;
}

// --- Minimal frontmatter parser (avoids gray-matter dependency) ---
function parseAdrFile(filePath: string): AdrRecord | null {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const yaml = fmMatch[1];
  const content = fmMatch[2];
  const basename = path.basename(filePath, '.md');
  const numMatch = basename.match(/^(\d+)/);
  if (!numMatch) return null;

  const num = parseInt(numMatch[1], 10);
  const id = `ADR-${String(num).padStart(4, '0')}`;

  const getField = (name: string): string => {
    const m = yaml.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };

  const getArray = (name: string): string[] => {
    const m = yaml.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'));
    if (!m) return [];
    const rest = m[1].trim();
    // Handle inline array: [ADR-0002, ADR-0003] or ["ADR-0005"]
    if (rest.startsWith('[')) {
      const inner = rest.slice(1, rest.indexOf(']'));
      if (inner.trim() === '') return [];
      return inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }
    // Handle multi-line array (- item)
    const idx = yaml.indexOf(`${name}:`);
    const after = yaml.slice(idx + name.length + 1 + rest.length);
    const lines: string[] = [];
    for (const line of after.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
        lines.push(val);
      } else if (lines.length > 0 || (trimmed !== '' && !trimmed.startsWith('-'))) {
        break;
      }
    }
    return lines;
  };

  const normalizeRef = (r: string): string | null => {
    const m = r.match(/(\d+)/);
    return m ? `ADR-${String(parseInt(m[1], 10)).padStart(4, '0')}` : null;
  };

  // Parse relates-to (array of objects with id + reason)
  const relatesTo: RelatesToEntry[] = [];
  const rtIdx = yaml.indexOf('relates-to:');
  if (rtIdx !== -1) {
    const after = yaml.slice(rtIdx + 'relates-to:'.length);
    let currentId: string | null = null;
    let currentReason: string | undefined;
    for (const line of after.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- id:')) {
        if (currentId) relatesTo.push({ id: currentId, reason: currentReason });
        const raw = trimmed.slice('- id:'.length).trim().replace(/^["']|["']$/g, '');
        currentId = normalizeRef(raw);
        currentReason = undefined;
      } else if (trimmed.startsWith('reason:') && currentId) {
        currentReason = trimmed.slice('reason:'.length).trim().replace(/^["']|["']$/g, '');
      } else if (trimmed.startsWith('- ') && !trimmed.startsWith('- id:')) {
        if (currentId) relatesTo.push({ id: currentId, reason: currentReason });
        const raw = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
        currentId = normalizeRef(raw);
        currentReason = undefined;
      } else if (trimmed !== '' && !trimmed.startsWith('reason:') && !trimmed.startsWith('#')) {
        break;
      }
    }
    if (currentId) relatesTo.push({ id: currentId, reason: currentReason });
  }

  return {
    id, number: num,
    title: getField('title'),
    status: getField('status') || 'proposed',
    date: getField('date'),
    deciders: getArray('deciders'),
    supersedes: getArray('supersedes').map(normalizeRef).filter((v): v is string => v !== null),
    amends: getArray('amends').map(normalizeRef).filter((v): v is string => v !== null),
    relatesTo: relatesTo.filter(r => r.id !== null) as RelatesToEntry[],
    tags: getArray('tags'),
    filePath, content,
  };
}

// --- Test runner ---
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

// Load real ADRs
const fixtureDir = path.resolve(__dirname, '..', 'test-fixtures', 'adr');
const adrFiles = fs.readdirSync(fixtureDir).filter(f => f.endsWith('.md')).sort();
const adrs = adrFiles.map(f => parseAdrFile(path.join(fixtureDir, f))).filter((a): a is AdrRecord => a !== null);
const edges = buildEdges(adrs);

console.log(`\nLoaded ${adrs.length} ADRs and ${edges.length} edges\n`);

// ============================
// Test 1: Edge inventory matches expectations
// ============================
console.log('--- Test 1: Edge inventory ---');

const expectedEdges: [string, string, string][] = [
  ['ADR-0006', 'ADR-0002', 'supersedes'],
  ['ADR-0006', 'ADR-0003', 'supersedes'],
  ['ADR-0006', 'ADR-0001', 'amends'],
  ['ADR-0004', 'ADR-0006', 'amends'],
  ['ADR-0006', 'ADR-0007', 'relates-to'],
  ['ADR-0007', 'ADR-0006', 'relates-to'],
  ['ADR-0008', 'ADR-0009', 'relates-to'],
  ['ADR-0009', 'ADR-0008', 'relates-to'],
  ['ADR-0010', 'ADR-0005', 'supersedes'],
  ['ADR-0010', 'ADR-0008', 'amends'],
  ['ADR-0010', 'ADR-0007', 'relates-to'],
  ['ADR-0010', 'ADR-0009', 'relates-to'],
];

for (const [src, tgt, type] of expectedEdges) {
  const found = edges.some(e => e.source === src && e.target === tgt && e.type === type);
  assert(found, `Edge exists: ${src} --${type}--> ${tgt}`);
}

assert(edges.length === expectedEdges.length,
  `Total edge count: expected ${expectedEdges.length}, got ${edges.length}`);

// ============================
// Test 2: validateInsights filters hallucinated missing-relation
// ============================
console.log('\n--- Test 2: Hallucination filtering ---');

const hallucinatedInsights: InsightMsg[] = [
  {
    id: 'test-1',
    type: 'missing-relation',
    severity: 'medium',
    title: 'ADR-0008 has no relationship to ADR-0009',
    description: 'These should be related',
    suggestion: 'Add relates-to',
    adrIds: ['ADR-0008', 'ADR-0009'],
  },
  {
    id: 'test-2',
    type: 'missing-relation',
    severity: 'medium',
    title: 'ADR-0010 should relate to ADR-0007',
    description: 'Both deal with auth',
    suggestion: 'Add relates-to',
    adrIds: ['ADR-0010', 'ADR-0007'],
  },
  {
    id: 'test-3',
    type: 'missing-relation',
    severity: 'medium',
    title: 'ADR-0010 still relates to obsolete ADR-0005',
    description: 'Supersession already exists',
    suggestion: 'Clean up',
    adrIds: ['ADR-0010', 'ADR-0005'],
  },
];

const filtered = validateInsights(hallucinatedInsights, edges);
assert(filtered.length === 0,
  `All 3 hallucinated missing-relation claims filtered out (got ${filtered.length})`);

// ============================
// Test 3: Legitimate insights are NOT filtered
// ============================
console.log('\n--- Test 3: Legitimate insights pass through ---');

const legitimateInsights: InsightMsg[] = [
  {
    id: 'legit-1',
    type: 'contradiction',
    severity: 'high',
    title: 'ADR-0004 contradicts deployment method',
    description: 'Real contradiction',
    suggestion: 'Resolve it',
    adrIds: ['ADR-0004'],
  },
  {
    id: 'legit-2',
    type: 'missing-relation',
    severity: 'low',
    title: 'ADR-0001 and ADR-0004 have no direct edge',
    description: 'ADR-0004 amends ADR-0006 which amends ADR-0001 but no direct link',
    suggestion: 'Consider adding relates-to',
    adrIds: ['ADR-0001', 'ADR-0004'],
  },
  {
    id: 'legit-3',
    type: 'suggested-update',
    severity: 'medium',
    title: 'ADR-0005 should be marked superseded',
    description: 'ADR-0010 supersedes it but 0005 status is still accepted',
    suggestion: 'Update status',
    adrIds: ['ADR-0005'],
  },
];

const legitimateFiltered = validateInsights(legitimateInsights, edges);
assert(legitimateFiltered.length === 3,
  `All 3 legitimate insights pass through (got ${legitimateFiltered.length})`);

// ============================
// Test 4: Graph structure embeds relationships per node
// ============================
console.log('\n--- Test 4: Graph structure has inline relationships ---');

const graph = buildAdrGraph(adrs, edges) as any;

const node0008 = graph.nodes.find((n: any) => n.id === 'ADR-0008');
assert(!!node0008, 'ADR-0008 node exists in graph');

const has0009outgoing = node0008.relationships.outgoing.some(
  (r: any) => r.target === 'ADR-0009' && r.type === 'relates-to'
);
assert(has0009outgoing, 'ADR-0008 has outgoing relates-to ADR-0009 in node');

const has0009incoming = node0008.relationships.incoming.some(
  (r: any) => r.source === 'ADR-0009' && r.type === 'relates-to'
);
assert(has0009incoming, 'ADR-0008 has incoming relates-to from ADR-0009 in node');

const has0010incoming = node0008.relationships.incoming.some(
  (r: any) => r.source === 'ADR-0010' && r.type === 'amends'
);
assert(has0010incoming, 'ADR-0008 has incoming amends from ADR-0010 in node');

const node0010 = graph.nodes.find((n: any) => n.id === 'ADR-0010');
assert(node0010.relationships.outgoing.length === 4,
  `ADR-0010 has 4 outgoing edges (got ${node0010.relationships.outgoing.length})`);

// ============================
// Test 5: Mixed hallucinated + legitimate batch
// ============================
console.log('\n--- Test 5: Mixed batch filtering ---');

const mixed: InsightMsg[] = [
  {
    id: 'mix-1', type: 'missing-relation', severity: 'medium',
    title: 'Hallucinated: 0006 and 0007',
    description: '', suggestion: '', adrIds: ['ADR-0006', 'ADR-0007'],
  },
  {
    id: 'mix-2', type: 'contradiction', severity: 'high',
    title: 'Real contradiction',
    description: '', suggestion: '', adrIds: ['ADR-0004', 'ADR-0006'],
  },
  {
    id: 'mix-3', type: 'missing-relation', severity: 'low',
    title: 'Legit: 0001 and 0005 have no edge',
    description: '', suggestion: '', adrIds: ['ADR-0001', 'ADR-0005'],
  },
];

const mixedResult = validateInsights(mixed, edges);
assert(mixedResult.length === 2, `Mixed batch: 2 of 3 pass (got ${mixedResult.length})`);
assert(mixedResult[0].id === 'mix-2', 'Contradiction passes');
assert(mixedResult[1].id === 'mix-3', 'Legit missing-relation passes');

// ============================
// Summary
// ============================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
