import { AdrRecord, AdrEdge, LifecycleMetrics } from './types';

export function computeLifecycleMetrics(adrs: AdrRecord[], edges: AdrEdge[]): LifecycleMetrics {
  return {
    velocity: computeVelocity(adrs),
    funnel: computeFunnel(adrs, edges),
    tagStability: computeTagStability(adrs),
    statusOverTime: computeStatusOverTime(adrs),
    decisionDebt: computeDecisionDebt(adrs),
    hotspots: computeHotspots(adrs),
    ownership: computeOwnership(adrs),
    confidence: computeConfidence(adrs),
    supersessionChains: computeSupersessionChains(edges),
  };
}

function computeVelocity(adrs: AdrRecord[]): { month: string; count: number }[] {
  const monthly = new Map<string, number>();
  for (const adr of adrs) {
    const month = adr.date.slice(0, 7); // YYYY-MM
    monthly.set(month, (monthly.get(month) || 0) + 1);
  }

  const months = Array.from(monthly.keys()).sort();
  if (months.length === 0) return [];

  const result: { month: string; count: number }[] = [];
  let current = months[0];
  const last = months[months.length - 1];

  while (current <= last) {
    result.push({ month: current, count: monthly.get(current) || 0 });
    current = nextMonth(current);
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

function computeStatusOverTime(adrs: AdrRecord[]): LifecycleMetrics['statusOverTime'] {
  if (adrs.length === 0) return [];

  const sorted = [...adrs].sort((a, b) => a.date.localeCompare(b.date));
  const firstMonth = sorted[0].date.slice(0, 7);
  const lastMonth = sorted[sorted.length - 1].date.slice(0, 7);

  // Bucket status changes per month — for simplicity, use the ADR's current status as
  // its contribution to its creation month. This gives a composition snapshot per month.
  const byMonth = new Map<string, { proposed: number; accepted: number; superseded: number; deprecated: number }>();
  for (const adr of sorted) {
    const month = adr.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { proposed: 0, accepted: 0, superseded: 0, deprecated: 0 });
    const bucket = byMonth.get(month)!;
    bucket[adr.status]++;
  }

  const result: LifecycleMetrics['statusOverTime'] = [];
  let current = firstMonth;
  const running = { proposed: 0, accepted: 0, superseded: 0, deprecated: 0 };

  while (current <= lastMonth) {
    const delta = byMonth.get(current);
    if (delta) {
      running.proposed += delta.proposed;
      running.accepted += delta.accepted;
      running.superseded += delta.superseded;
      running.deprecated += delta.deprecated;
    }
    result.push({ month: current, ...running });
    current = nextMonth(current);
  }

  return result;
}

function computeDecisionDebt(adrs: AdrRecord[]): LifecycleMetrics['decisionDebt'] {
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  let overdue = 0;
  let dueSoon = 0;
  let expired = 0;
  let stale = 0;
  const tagBuckets = new Map<string, { overdue: number; dueSoon: number; stale: number }>();

  const bump = (tag: string, key: 'overdue' | 'dueSoon' | 'stale') => {
    if (!tagBuckets.has(tag)) tagBuckets.set(tag, { overdue: 0, dueSoon: 0, stale: 0 });
    tagBuckets.get(tag)![key]++;
  };

  for (const adr of adrs) {
    if (adr.reviewStatus === 'overdue') {
      overdue++;
      for (const tag of adr.tags) bump(tag, 'overdue');
    }
    if (adr.reviewStatus === 'due-soon') {
      dueSoon++;
      for (const tag of adr.tags) bump(tag, 'dueSoon');
    }
    if (adr.reviewStatus === 'expired') {
      expired++;
    }
    const created = new Date(adr.date);
    const hasReview = !!(adr.reviewBy || adr.expires);
    if (
      adr.status === 'accepted' &&
      !hasReview &&
      !isNaN(created.getTime()) &&
      created < oneYearAgo
    ) {
      stale++;
      for (const tag of adr.tags) bump(tag, 'stale');
    }
  }

  const byTag = Array.from(tagBuckets.entries())
    .map(([tag, v]) => ({ tag, ...v }))
    .filter(r => r.overdue + r.dueSoon + r.stale > 0)
    .sort((a, b) => (b.overdue + b.dueSoon + b.stale) - (a.overdue + a.dueSoon + a.stale));

  return { overdue, dueSoon, expired, stale, byTag };
}

function computeHotspots(adrs: AdrRecord[]): LifecycleMetrics['hotspots'] {
  if (adrs.length === 0) return { quarters: [], rows: [] };

  const dates = adrs.map(a => a.date).filter(Boolean).sort();
  if (dates.length === 0) return { quarters: [], rows: [] };

  const firstQuarter = dateToQuarter(dates[0]);
  const lastQuarter = dateToQuarter(dates[dates.length - 1]);
  const quarters: string[] = [];
  let current = firstQuarter;
  while (current <= lastQuarter) {
    quarters.push(current);
    current = nextQuarter(current);
  }

  // tag -> quarter -> count
  const tagTotals = new Map<string, number>();
  const tagQuarters = new Map<string, Map<string, number>>();

  for (const adr of adrs) {
    const q = dateToQuarter(adr.date);
    if (!q) continue;
    for (const tag of adr.tags) {
      tagTotals.set(tag, (tagTotals.get(tag) || 0) + 1);
      if (!tagQuarters.has(tag)) tagQuarters.set(tag, new Map());
      const qm = tagQuarters.get(tag)!;
      qm.set(q, (qm.get(q) || 0) + 1);
    }
  }

  const rows = Array.from(tagTotals.entries())
    .filter(([, total]) => total >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => ({
      tag,
      counts: quarters.map(q => tagQuarters.get(tag)?.get(q) ?? 0),
    }));

  return { quarters, rows };
}

function computeOwnership(adrs: AdrRecord[]): LifecycleMetrics['ownership'] {
  const perDecider = new Map<string, { total: number; tags: Set<string> }>();
  let soloAuthoredCount = 0;

  // tag -> set of deciders; a tag with only one distinct decider across all its ADRs = bus-factor 1
  const tagDeciders = new Map<string, Set<string>>();

  for (const adr of adrs) {
    if (adr.deciders.length === 1) soloAuthoredCount++;
    for (const name of adr.deciders) {
      if (!perDecider.has(name)) perDecider.set(name, { total: 0, tags: new Set() });
      const entry = perDecider.get(name)!;
      entry.total++;
      for (const tag of adr.tags) entry.tags.add(tag);
    }
    for (const tag of adr.tags) {
      if (!tagDeciders.has(tag)) tagDeciders.set(tag, new Set());
      const set = tagDeciders.get(tag)!;
      for (const d of adr.deciders) set.add(d);
    }
  }

  const deciders = Array.from(perDecider.entries())
    .map(([name, v]) => ({ name, total: v.total, tags: Array.from(v.tags).sort() }))
    .sort((a, b) => b.total - a.total);

  const busFactorOneTags = Array.from(tagDeciders.entries())
    .filter(([, set]) => set.size === 1)
    .map(([tag]) => tag)
    .sort();

  return {
    deciders,
    soloAuthoredCount,
    totalCount: adrs.length,
    busFactorOneTags,
  };
}

function computeConfidence(adrs: AdrRecord[]): LifecycleMetrics['confidence'] {
  let high = 0, medium = 0, low = 0, none = 0;
  const lowAcceptedIds: string[] = [];

  for (const adr of adrs) {
    switch (adr.confidence) {
      case 'high': high++; break;
      case 'medium': medium++; break;
      case 'low': low++; break;
      default: none++;
    }
    if (adr.confidence === 'low' && adr.status === 'accepted') {
      lowAcceptedIds.push(adr.id);
    }
  }

  return { high, medium, low, none, lowAcceptedIds };
}

function computeSupersessionChains(edges: AdrEdge[]): LifecycleMetrics['supersessionChains'] {
  // An edge A --supersedes--> B means A replaces B; chain direction B → A → ... (oldest → newest).
  const supers = edges.filter(e => e.type === 'supersedes');
  if (supers.length === 0) return [];

  // target -> source (B is superseded by A)  =>  next in chain when walking oldest → newest
  const nextBySource = new Map<string, string>();
  const allTargets = new Set<string>();
  for (const e of supers) {
    nextBySource.set(e.target, e.source);
    allTargets.add(e.target);
  }

  // Walk forward from every target to build candidate chains; dedupe with `visited`.
  const visited = new Set<string>();
  const rawChains: string[][] = [];
  for (const t of allTargets) {
    if (visited.has(t)) continue;
    const chain: string[] = [t];
    let cursor = t;
    while (nextBySource.has(cursor)) {
      const nxt = nextBySource.get(cursor)!;
      if (chain.includes(nxt)) break; // cycle guard
      chain.push(nxt);
      cursor = nxt;
    }
    for (const id of chain) visited.add(id);
    rawChains.push(chain);
  }

  // Keep only chains of length >= 2, and drop chains that are a suffix of another
  const chainStrings = rawChains.map(c => c.join('>'));
  const result: { chain: string[] }[] = [];
  for (let i = 0; i < rawChains.length; i++) {
    if (rawChains[i].length < 2) continue;
    const s = chainStrings[i];
    const isSubchain = chainStrings.some((other, j) => j !== i && other.length > s.length && other.endsWith(s));
    if (!isSubchain) result.push({ chain: rawChains[i] });
  }

  result.sort((a, b) => b.chain.length - a.chain.length);
  return result;
}

// --- helpers ---

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function dateToQuarter(date: string): string {
  const [y, m] = date.split('-').map(Number);
  if (!y || !m) return '';
  const q = Math.ceil(m / 3);
  return `${y}-Q${q}`;
}

function nextQuarter(yq: string): string {
  const [yStr, qStr] = yq.split('-Q');
  const y = Number(yStr);
  const q = Number(qStr);
  return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
}
