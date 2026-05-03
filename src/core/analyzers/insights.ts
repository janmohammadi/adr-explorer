import { AdrRecord, AdrEdge, InsightMsg } from '../types';
import { LMProvider } from '../lmProvider';

const SYSTEM_PROMPT = `You are a senior architecture reviewer. You receive a JSON graph of Architecture Decision Records (nodes + edges) and surface only problems that would actually bite a team.

Rules:
- Be ruthless about signal-to-noise. Only flag things a tech lead would act on. Skip obvious, cosmetic, or low-value observations.
- Never pad the list. 2 real insights beat 8 generic ones. Return [] if nothing meaningful stands out.
- Every insight must point to specific ADR IDs and explain what's concretely wrong, not just "these might be related."
- CRITICAL: Each node already lists its outgoing AND incoming relationships. Trust these lists completely. Do NOT claim a relationship is missing if it appears in the node's relationships. Read them carefully before flagging missing-relation.

Return a JSON array. Each object:
{ "type": "contradiction" | "missing-relation" | "suggested-update" | "staleness" | "coherence",
  "severity": "high" | "medium" | "low",
  "title": "< 80 chars, specific",
  "description": "What's wrong — one sentence, cite the actual conflict or gap",
  "suggestion": "Concrete next step — who should do what",
  "adrIds": ["ADR-XXXX", ...] }

What qualifies:
- contradiction: Decisions that actively conflict in practice (not just different tags — real incompatible assumptions or approaches)
- missing-relation: ADRs that clearly depend on or supersede each other but have no edge. Only flag when the missing link would cause someone to miss context. Double-check the node's "relationships" field before claiming any relation is missing.
- suggested-update: A decision that is effectively dead or wrong given later decisions. Should be superseded, not just amended.
- staleness: An accepted decision that relies on assumptions or tech that no longer hold.
- coherence: A group of decisions that together tell an inconsistent story — e.g., one says "we chose X because Y" and another assumes not-Y.

Return ONLY the JSON array. No markdown, no prose, no fences.`;

function buildAdrGraph(adrs: AdrRecord[], edges: AdrEdge[]): string {
  const outgoing = new Map<string, { type: string; target: string; reason?: string }[]>();
  const incoming = new Map<string, { type: string; source: string; reason?: string }[]>();

  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push({ type: e.type, target: e.target, ...(e.reason ? { reason: e.reason } : {}) });

    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push({ type: e.type, source: e.source, ...(e.reason ? { reason: e.reason } : {}) });
  }

  const graph = {
    nodes: adrs.map(adr => ({
      id: adr.id,
      title: adr.title,
      status: adr.status,
      date: adr.date,
      tags: adr.tags,
      deciders: adr.deciders,
      relationships: {
        outgoing: outgoing.get(adr.id) || [],
        incoming: incoming.get(adr.id) || [],
      },
      content: adr.content,
    })),
  };
  return JSON.stringify(graph);
}

/** Validate LLM insights against actual edge data to filter out hallucinations. */
export function validateInsights(insights: InsightMsg[], edges: AdrEdge[]): InsightMsg[] {
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
        const hasSupersedes = edgeSet.has(`${ids[i]}->${ids[j]}:supersedes`);
        const hasAmends = edgeSet.has(`${ids[i]}->${ids[j]}:amends`);
        const hasRelates = edgeSet.has(`${ids[i]}->${ids[j]}:relates-to`);
        if (hasSupersedes || hasAmends || hasRelates) {
          return false;
        }
      }
    }
    return true;
  });
}

export async function analyzeInsights(
  adrs: AdrRecord[],
  edges: AdrEdge[],
  lm: LMProvider,
  signal: AbortSignal
): Promise<InsightMsg[]> {
  const userContent = buildAdrGraph(adrs, edges);

  let fullText = '';
  for await (const chunk of lm.sendRequest(SYSTEM_PROMPT, userContent, signal)) {
    fullText += chunk;
  }

  const parsed = JSON.parse(fullText.trim());
  if (!Array.isArray(parsed)) {
    return [];
  }

  const raw: InsightMsg[] = parsed.map((item: any, index: number) => ({
    id: `insight-${index}`,
    type: item.type || 'coherence',
    severity: item.severity || 'medium',
    title: item.title || 'Untitled insight',
    description: item.description || '',
    suggestion: item.suggestion || '',
    adrIds: Array.isArray(item.adrIds) ? item.adrIds : [],
  }));

  return validateInsights(raw, edges);
}
