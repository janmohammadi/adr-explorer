import { AdrRecord, AdrEdge, LifecycleMetrics } from './types';

export function computeLifecycleMetrics(adrs: AdrRecord[], edges: AdrEdge[]): LifecycleMetrics {
  return {
    velocity: computeVelocity(adrs),
    funnel: computeFunnel(adrs, edges),
    tagStability: computeTagStability(adrs),
  };
}

function computeVelocity(adrs: AdrRecord[]): { month: string; count: number }[] {
  const monthly = new Map<string, number>();
  for (const adr of adrs) {
    const month = adr.date.slice(0, 7); // YYYY-MM
    monthly.set(month, (monthly.get(month) || 0) + 1);
  }

  // Fill gaps between min and max months
  const months = Array.from(monthly.keys()).sort();
  if (months.length === 0) return [];

  const result: { month: string; count: number }[] = [];
  let current = months[0];
  const last = months[months.length - 1];

  while (current <= last) {
    result.push({ month: current, count: monthly.get(current) || 0 });
    // Advance to next month
    const [y, m] = current.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    current = next;
  }

  return result;
}

function computeFunnel(adrs: AdrRecord[], edges: AdrEdge[]): LifecycleMetrics['funnel'] {
  const amendedIds = new Set(edges.filter(e => e.type === 'amends').map(e => e.target));

  return {
    proposed: adrs.filter(a => a.status === 'proposed').length,
    accepted: adrs.filter(a => a.status === 'accepted').length,
    amended: adrs.filter(a => amendedIds.has(a.id)).length,
    superseded: adrs.filter(a => a.status === 'superseded').length,
    deprecated: adrs.filter(a => a.status === 'deprecated').length,
  };
}

function computeTagStability(adrs: AdrRecord[]): LifecycleMetrics['tagStability'] {
  const tagData = new Map<string, { total: number; churned: number }>();

  for (const adr of adrs) {
    for (const tag of adr.tags) {
      if (!tagData.has(tag)) tagData.set(tag, { total: 0, churned: 0 });
      const data = tagData.get(tag)!;
      data.total++;
      if (adr.status === 'superseded' || adr.status === 'deprecated') {
        data.churned++;
      }
    }
  }

  return Array.from(tagData.entries())
    .map(([tag, data]) => ({
      tag,
      total: data.total,
      churned: data.churned,
      stability: data.total > 0 ? Math.round((1 - data.churned / data.total) * 100) : 100,
    }))
    .sort((a, b) => a.stability - b.stability);
}
