import { AdrRecord, DistillSuggestion, DistillReport } from '../types';
import { LMProvider } from '../lmProvider';

const SYSTEM_PROMPT = `You are a senior architecture reviewer specializing in keeping ADRs concise and maintainable. You receive a single Architecture Decision Record and identify content that should be distilled to maximize signal-to-noise.

Rules:
- Be ruthless about noise. Only flag content a tech lead would want removed. Skip minor style issues.
- Never pad the list. 3 real suggestions beat 10 generic ones. Return [] if the ADR is already clean and concise.
- Every suggestion must quote the EXACT text to distill — copy it verbatim from the input. Quote the FULL problematic paragraph or body text, NOT just a section heading. If an entire section is problematic, quote the full body content of that section (everything after the heading), not the heading itself.
- NEVER quote just a markdown heading (lines starting with #). Always quote the actual body text underneath it.
- Focus on content that reduces long-term maintainability: filler that obscures the actual decision, redundancy that creates update burden, implementation details that will go stale.
- Do NOT quote text inside fenced code blocks.

Return a JSON array. Each object:
{ "category": "verbose-filler" | "redundant-section" | "excessive-alternatives" | "implementation-detail" | "generic-consequence" | "unnecessary-background",
  "severity": "high" | "medium" | "low",
  "target": "exact verbatim quote of the text to distill",
  "reason": "one sentence — why this hurts maintainability",
  "replacement": "suggested replacement text, or empty string if the text should be deleted entirely" }

Categories explained:
- verbose-filler: Flowery prose, hedging language, filler sentences that add no architectural context (e.g., "In the ever-evolving landscape of...", "After careful consideration and thorough analysis...")
- redundant-section: Content that restates the same point already made elsewhere in the document
- excessive-alternatives: Too many alternatives listed with boilerplate pros/cons when 2-3 key options would suffice
- implementation-detail: Specifics that belong in tickets or code comments, not in an architectural decision record (e.g., exact API payloads, step-by-step deployment scripts, configuration snippets)
- generic-consequence: Vague consequences that could apply to any decision ("This will improve maintainability", "This reduces complexity") without specific reasoning tied to this decision
- unnecessary-background: Lengthy explanations of well-known technologies or patterns that the intended audience already understands

Return ONLY the JSON array. No markdown, no prose, no fences.`;

function buildUserContent(adr: AdrRecord): string {
  return JSON.stringify({
    title: adr.title,
    status: adr.status,
    tags: adr.tags,
    content: adr.content,
  });
}

function validateSuggestions(suggestions: DistillSuggestion[], content: string): DistillSuggestion[] {
  return suggestions.filter(s => {
    if (!s.target || s.target.length < 10) return false;
    return content.includes(s.target);
  });
}

export async function analyzeDistill(
  adr: AdrRecord,
  lm: LMProvider,
  signal: AbortSignal
): Promise<DistillSuggestion[]> {
  return runAnalysis(lm, adr, signal);
}

export async function analyzeDistillAll(
  adrs: AdrRecord[],
  lm: LMProvider,
  signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
  onResult?: (report: DistillReport) => void
): Promise<DistillReport[]> {
  const reports: DistillReport[] = [];
  const CONCURRENCY = 3;
  let completed = 0;

  async function processAdr(adr: AdrRecord) {
    if (signal.aborted) return;
    try {
      const suggestions = await runAnalysis(lm, adr, signal);
      const report: DistillReport = { adrId: adr.id, adrTitle: adr.title, suggestions };
      reports.push(report);
      onResult?.(report);
    } catch {
      onResult?.({ adrId: adr.id, adrTitle: adr.title, suggestions: [] });
    }
    completed++;
    onProgress?.(completed, adrs.length);
  }

  const queue = [...adrs];
  const active: Promise<void>[] = [];
  while (queue.length > 0 || active.length > 0) {
    while (active.length < CONCURRENCY && queue.length > 0 && !signal.aborted) {
      const adr = queue.shift()!;
      const p = processAdr(adr).then(() => { active.splice(active.indexOf(p), 1); });
      active.push(p);
    }
    if (active.length > 0) {
      await Promise.race(active);
    }
  }

  return reports;
}

export function applySuggestion(content: string, suggestion: DistillSuggestion): string {
  return content.replace(suggestion.target, suggestion.replacement);
}

async function runAnalysis(
  lm: LMProvider,
  adr: AdrRecord,
  signal: AbortSignal
): Promise<DistillSuggestion[]> {
  const userContent = buildUserContent(adr);

  let fullText = '';
  for await (const chunk of lm.sendRequest(SYSTEM_PROMPT, userContent, signal)) {
    fullText += chunk;
  }

  let jsonText = fullText.trim();
  const fenceMatch = jsonText.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim();
  }
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const raw: DistillSuggestion[] = parsed.map((item: any, index: number) => ({
    id: `distill-${adr.id}-${index}`,
    category: item.category || 'verbose-filler',
    severity: item.severity || 'medium',
    target: item.target || '',
    reason: item.reason || '',
    replacement: item.replacement || '',
  }));

  return validateSuggestions(raw, adr.content).slice(0, 10);
}
