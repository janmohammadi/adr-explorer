import matter = require('gray-matter');
import * as path from 'path';
import { AdrRecord, AdrStatus, ConfidenceLevel } from './types';

const VALID_STATUSES: AdrStatus[] = ['proposed', 'accepted', 'deprecated', 'superseded'];
const VALID_CONFIDENCE: ConfidenceLevel[] = ['high', 'medium', 'low'];
const DUE_SOON_DAYS = 30;

function normalizeRefs(refs: unknown): string[] {
  if (!Array.isArray(refs)) { return []; }
  return refs
    .map((r: unknown) => {
      const m = String(r).match(/(\d+)/);
      return m ? `ADR-${String(parseInt(m[1], 10)).padStart(4, '0')}` : null;
    })
    .filter((v): v is string => v !== null);
}

export function parseAdrFile(filePath: string, rawContent: string): AdrRecord | null {
  try {
    const { data, content } = matter(rawContent);

    const basename = path.basename(filePath, '.md');
    const numberMatch = basename.match(/^(\d+)/);
    if (!numberMatch) { return null; }

    const num = parseInt(numberMatch[1], 10);
    const id = `ADR-${String(num).padStart(4, '0')}`;

    const rawStatus = (data.status || 'proposed').toString().toLowerCase().trim();
    const status: AdrStatus = VALID_STATUSES.includes(rawStatus as AdrStatus)
      ? (rawStatus as AdrStatus)
      : 'proposed';

    const date = data.date
      ? new Date(data.date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const reviewBy = data['review-by'] ? new Date(data['review-by']).toISOString().slice(0, 10) : undefined;
    const reviewInterval = data['review-interval'] ? String(data['review-interval']) : undefined;
    const expires = data['expires'] ? new Date(data['expires']).toISOString().slice(0, 10) : undefined;
    const rawConfidence = String(data.confidence || '').toLowerCase().trim();
    const confidence = VALID_CONFIDENCE.includes(rawConfidence as ConfidenceLevel) ? rawConfidence as ConfidenceLevel : undefined;

    // Compute review status
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const soonStr = new Date(now.getTime() + DUE_SOON_DAYS * 86400000).toISOString().slice(0, 10);
    let reviewStatus: 'overdue' | 'due-soon' | 'expired' | 'ok' | undefined;

    if (expires && todayStr >= expires) {
      reviewStatus = 'expired';
    } else if (reviewBy && todayStr > reviewBy) {
      reviewStatus = 'overdue';
    } else if (reviewBy && soonStr >= reviewBy) {
      reviewStatus = 'due-soon';
    } else if (reviewBy || expires) {
      reviewStatus = 'ok';
    }

    return {
      id,
      number: num,
      title: data.title || basename.replace(/^\d+-/, '').replace(/-/g, ' '),
      status,
      date,
      deciders: Array.isArray(data.deciders) ? data.deciders : [],
      supersedes: normalizeRefs(data.supersedes),
      amends: normalizeRefs(data.amends),
      relatesTo: normalizeRefs(data['relates-to']),
      tags: Array.isArray(data.tags) ? data.tags : [],
      filePath,
      content,
      reviewBy,
      reviewInterval,
      expires,
      confidence,
      reviewStatus,
    };
  } catch {
    return null;
  }
}
