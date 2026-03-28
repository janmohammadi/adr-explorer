import * as vscode from 'vscode';
import * as fs from 'fs';
import { AdrRecord, AdrEdge } from './types';

// ===== Model Selection =====

async function getModel(): Promise<vscode.LanguageModelChat | null> {
  try {
    let models = await vscode.lm.selectChatModels({ family: 'claude-opus' });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({ family: 'claude-sonnet' });
    }
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels();
    }
    return models.length > 0 ? models[0] : null;
  } catch {
    return null;
  }
}

async function streamResponse(model: vscode.LanguageModelChat, messages: vscode.LanguageModelChatMessage[]): Promise<string> {
  const response = await model.sendRequest(messages, {});
  let result = '';
  for await (const chunk of response.text) {
    result += chunk;
  }
  return result;
}

function adrSummary(adr: AdrRecord): string {
  return `- ${adr.id}: "${adr.title}" [${adr.status}] (${adr.date}) tags:[${adr.tags.join(',')}]` +
    (adr.supersedes.length ? ` supersedes:[${adr.supersedes.join(',')}]` : '') +
    (adr.amends.length ? ` amends:[${adr.amends.join(',')}]` : '') +
    (adr.relatesTo.length ? ` relates-to:[${adr.relatesTo.join(',')}]` : '');
}

function adrDetail(adr: AdrRecord): string {
  return `### ${adr.id}: ${adr.title}\nStatus: ${adr.status} | Date: ${adr.date} | Tags: ${adr.tags.join(', ')}\n${adr.content.slice(0, 500)}`;
}

// ===== Existing Single-Shot Functions (kept for gap analysis, cluster, brief) =====

export async function generateClusterSummary(adrs: AdrRecord[]): Promise<string> {
  const model = await getModel();
  if (!model) return '⚠ No language model available. Install a VS Code language model extension.';

  const adrList = adrs.map(adrSummary).join('\n');
  const messages = [vscode.LanguageModelChatMessage.User(
    `You are an architecture advisor. Given these ADRs, write a concise narrative (3-5 sentences) explaining how they relate and their combined architectural direction.\n\nADRs:\n${adrList}`
  )];
  return streamResponse(model, messages);
}

export async function generateGapAnalysis(adrs: AdrRecord[]): Promise<string> {
  const model = await getModel();
  if (!model) return '⚠ No language model available. Install a VS Code language model extension.';

  const adrList = adrs.map(adrSummary).join('\n');
  const allTags = [...new Set(adrs.flatMap(a => a.tags))].sort();
  const messages = [vscode.LanguageModelChatMessage.User(
    `You are an architecture advisor. Analyze these ADRs and suggest 3-5 MISSING decisions — areas where ADRs should exist but don't.\n\nConsider: security, scalability, data management, error handling, testing, deployment, monitoring, API design, auth, caching.\n\nCurrent ADRs:\n${adrList}\n\nTags in use: ${allTags.join(', ')}\n\nFormat as a numbered list with proposed title + 1-2 sentence justification.`
  )];
  return streamResponse(model, messages);
}

export async function generateStakeholderBrief(adr: AdrRecord): Promise<string> {
  const model = await getModel();
  if (!model) return '⚠ No language model available. Install a VS Code language model extension.';

  const messages = [vscode.LanguageModelChatMessage.User(
    `Write a brief non-technical stakeholder summary of this ADR. Audience: project managers. 3-4 sentences: what was decided, why it matters, practical impact.\n\nADR: ${adr.id} - "${adr.title}" [${adr.status}] (${adr.date})\nTags: ${adr.tags.join(', ')}\n\n${adr.content}`
  )];
  return streamResponse(model, messages);
}

// ===== Related ADR Detection =====

export function findRelatedAdrs(description: string, adrs: AdrRecord[], edges: AdrEdge[]): AdrRecord[] {
  const keywords = extractKeywords(description);
  if (keywords.length === 0) return [];

  const scores = new Map<string, number>();

  for (const adr of adrs) {
    let score = 0;
    const titleLower = adr.title.toLowerCase();
    const contentLower = adr.content.toLowerCase();

    for (const kw of keywords) {
      // Tag match (highest weight)
      if (adr.tags.some(t => t.toLowerCase().includes(kw))) score += 3;
      // Title match
      if (titleLower.includes(kw)) score += 2;
      // Content match
      if (contentLower.includes(kw)) score += 1;
    }

    if (score > 0) scores.set(adr.id, score);
  }

  // Add 1-hop connected ADRs
  for (const edge of edges) {
    if (scores.has(edge.source) && !scores.has(edge.target)) {
      scores.set(edge.target, 1);
    }
    if (scores.has(edge.target) && !scores.has(edge.source)) {
      scores.set(edge.source, 1);
    }
  }

  return adrs
    .filter(a => scores.has(a.id))
    .sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0))
    .slice(0, 10);
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'about', 'between', 'after', 'before', 'during', 'without', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our', 'i', 'my', 'and', 'or', 'but', 'not', 'if', 'then', 'than', 'when', 'where', 'what', 'how', 'which', 'who', 'use', 'using', 'need', 'want', 'like', 'new', 'also', 'just', 'more', 'very', 'some', 'all', 'each', 'every']);

  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 15);
}

// ===== Codebase Scanning =====

export async function analyzeCodebase(keywords: string[]): Promise<string> {
  if (keywords.length === 0) return '';

  try {
    // Search for relevant files by keyword patterns
    const patterns = keywords.slice(0, 5).map(kw => `**/*${kw}*`);
    const allFiles: vscode.Uri[] = [];

    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5);
      allFiles.push(...files);
    }

    // Also search common config and architecture files
    const configFiles = await vscode.workspace.findFiles(
      '{**/package.json,**/tsconfig.json,**/docker-compose*.yml,**/Dockerfile,**/*.config.{js,ts},**/README.md}',
      '**/node_modules/**', 5
    );
    allFiles.push(...configFiles);

    // Deduplicate
    const seen = new Set<string>();
    const uniqueFiles = allFiles.filter(f => {
      if (seen.has(f.fsPath)) return false;
      seen.add(f.fsPath);
      return true;
    }).slice(0, 8);

    if (uniqueFiles.length === 0) return '';

    const summaries: string[] = [];
    for (const file of uniqueFiles) {
      try {
        const content = await fs.promises.readFile(file.fsPath, 'utf-8');
        const lines = content.split('\n').slice(0, 40).join('\n');
        const relativePath = vscode.workspace.asRelativePath(file);
        summaries.push(`### ${relativePath}\n\`\`\`\n${lines}\n\`\`\``);
      } catch {
        // skip unreadable files
      }
    }

    return summaries.length > 0
      ? `\n\n## Relevant Codebase Files\n\n${summaries.join('\n\n')}`
      : '';
  } catch {
    return '';
  }
}

// ===== Structured UI Types =====

export interface StructuredQuestion {
  id: string;
  question: string;
  options: { label: string; description?: string }[];
}

export interface StructuredOption {
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  effort: 'low' | 'medium' | 'high';
  risk: string;
}

export interface StructuredImpact {
  adrId: string;
  adrTitle: string;
  relationship: 'supersedes' | 'amends' | 'relates-to' | 'tension';
  reason: string;
}

export type DraftMessage =
  | { kind: 'text'; content: string }
  | { kind: 'questions'; intro: string; questions: StructuredQuestion[] }
  | { kind: 'options'; intro: string; options: StructuredOption[]; recommendation?: string }
  | { kind: 'impact'; summary: string; impacts: StructuredImpact[]; sideEffects: string[] }
  | { kind: 'confirm'; summary: string; actions: { label: string; action: string }[] }
  | { kind: 'draft'; content: string };

// ===== Interactive Draft Session =====

export type DraftPhase = 'describe' | 'context' | 'options' | 'decide' | 'review';

export interface DraftSessionState {
  phase: DraftPhase;
  relatedAdrIds: string[];
  codeContext: string;
}

const SYSTEM_PROMPT = `You are a senior architecture advisor co-drafting an Architecture Decision Record (ADR) with an architect. You are a THINKING PARTNER, not a text generator.

Your role:
- Ask sharp, clarifying questions to help the architect think through their decision
- Surface side effects and implications they might not have considered
- Present concrete options with honest trade-offs (no hand-waving)
- Challenge weak reasoning respectfully
- When the architect decides, produce a SHORT, DIRECT ADR — no filler, no corporate fluff

Communication style:
- Be direct and concise. No pleasantries or filler.
- Use bullet points over paragraphs
- Name specific technologies, patterns, and files when relevant
- If something is risky, say so plainly

You will go through phases. Follow the CURRENT PHASE instruction carefully.`;

export class DraftSession {
  private messages: vscode.LanguageModelChatMessage[] = [];
  private _phase: DraftPhase = 'describe';
  private relatedAdrs: AdrRecord[] = [];
  private _codeContext: string = '';
  private allAdrs: AdrRecord[];
  private allEdges: AdrEdge[];
  private model: vscode.LanguageModelChat | null = null;

  constructor(adrs: AdrRecord[], edges: AdrEdge[]) {
    this.allAdrs = adrs;
    this.allEdges = edges;
  }

  get state(): DraftSessionState {
    return {
      phase: this._phase,
      relatedAdrIds: this.relatedAdrs.map(a => a.id),
      codeContext: this._codeContext,
    };
  }

  async start(description: string): Promise<DraftMessage[]> {
    this.model = await getModel();
    if (!this.model) return [{ kind: 'text', content: '⚠ No language model available. Install a VS Code language model extension (e.g., GitHub Copilot, Claude for VS Code).' }];

    this.relatedAdrs = findRelatedAdrs(description, this.allAdrs, this.allEdges);
    const keywords = extractKeywords(description);
    this._codeContext = await analyzeCodebase(keywords);

    const existingAdrsContext = this.allAdrs.map(adrSummary).join('\n');
    const relatedDetail = this.relatedAdrs.length > 0
      ? '\n\n## Related ADRs (most relevant first)\n\n' + this.relatedAdrs.map(adrDetail).join('\n\n')
      : '\n\nNo closely related ADRs found.';

    this.messages = [
      vscode.LanguageModelChatMessage.User(
        `${SYSTEM_PROMPT}\n\n## Existing ADR Portfolio\n\n${existingAdrsContext}${relatedDetail}${this._codeContext}\n\n---\n\nCURRENT PHASE: DESCRIBE\n\nThe architect wants to create an ADR about: "${description}"\n\nRespond with ONLY a JSON object (no markdown, no code fences). Structure:\n{\n  "acknowledgment": "1 sentence about what they're thinking",\n  "relatedAdrs": "brief explanation of related ADRs found",\n  "questions": [\n    {\n      "id": "q1",\n      "question": "the clarifying question",\n      "options": [\n        { "label": "short label", "description": "1-sentence description" },\n        { "label": "short label", "description": "1-sentence description" },\n        { "label": "short label", "description": "1-sentence description" }\n      ]\n    }\n  ]\n}\n\nInclude 2-3 questions. Focus on scope, constraints, and success criteria. Each question should have 2-4 concrete options. Make options specific to this decision, not generic.`
      )
    ];

    this._phase = 'describe';
    const response = await streamResponse(this.model, this.messages);
    this.messages.push(vscode.LanguageModelChatMessage.Assistant(response));
    return this._parseDescribeResponse(response);
  }

  async chat(userMessage: string): Promise<DraftMessage[]> {
    if (!this.model) return [{ kind: 'text', content: '⚠ Session not initialized.' }];
    this.messages.push(vscode.LanguageModelChatMessage.User(userMessage));
    const response = await streamResponse(this.model, this.messages);
    this.messages.push(vscode.LanguageModelChatMessage.Assistant(response));
    return [{ kind: 'text', content: response }];
  }

  async advanceToContext(answers: string): Promise<DraftMessage[]> {
    if (!this.model) return [{ kind: 'text', content: '⚠ Session not initialized.' }];
    this._phase = 'context';

    this.messages.push(vscode.LanguageModelChatMessage.User(
      `The architect answered: ${answers}\n\nPHASE TRANSITION → CONTEXT & IMPACT ANALYSIS\n\nRespond with ONLY a JSON object:\n{\n  "summary": "2-3 sentence problem statement",\n  "impacts": [\n    { "adrId": "ADR-XXXX", "adrTitle": "title", "relationship": "supersedes|amends|relates-to|tension", "reason": "why" }\n  ],\n  "sideEffects": ["specific side effect 1", "specific side effect 2"],\n  "constraints": "key constraints identified"\n}\n\nBe specific. Use actual ADR IDs from the portfolio. If no impacts, use empty array.`
    ));

    const response = await streamResponse(this.model, this.messages);
    this.messages.push(vscode.LanguageModelChatMessage.Assistant(response));
    return this._parseContextResponse(response);
  }

  async advanceToOptions(): Promise<DraftMessage[]> {
    if (!this.model) return [{ kind: 'text', content: '⚠ Session not initialized.' }];
    this._phase = 'options';

    this.messages.push(vscode.LanguageModelChatMessage.User(
      `PHASE TRANSITION → EXPLORE OPTIONS\n\nRespond with ONLY a JSON object:\n{\n  "intro": "1 sentence framing the choice",\n  "options": [\n    {\n      "title": "Option name",\n      "description": "1-2 sentence description",\n      "pros": ["specific pro 1", "specific pro 2"],\n      "cons": ["specific con 1", "specific con 2"],\n      "effort": "low|medium|high",\n      "risk": "main risk in 1 sentence"\n    }\n  ],\n  "recommendation": "which option you'd recommend and why (or null if it depends)"\n}\n\nInclude 2-3 options. Be specific, not generic. No "do nothing" unless viable.`
    ));

    const response = await streamResponse(this.model, this.messages);
    this.messages.push(vscode.LanguageModelChatMessage.Assistant(response));
    return this._parseOptionsResponse(response);
  }

  async advanceToDecide(decision: string): Promise<DraftMessage[]> {
    if (!this.model) return [{ kind: 'text', content: '⚠ Session not initialized.' }];
    this._phase = 'decide';

    this.messages.push(vscode.LanguageModelChatMessage.User(
      `The architect has decided: "${decision}"\n\nPHASE TRANSITION → DECIDE\n\nRespond with ONLY a JSON object:\n{\n  "summary": "restate the decision in 1 clear sentence",\n  "impacts": [\n    { "adrId": "ADR-XXXX", "adrTitle": "title", "relationship": "supersedes|amends|relates-to", "reason": "why" }\n  ],\n  "confidence": "high|medium|low",\n  "confidenceReason": "why this confidence level",\n  "reviewDate": "suggested review date",\n  "warnings": ["anything the architect should consider"]\n}`
    ));

    const response = await streamResponse(this.model, this.messages);
    this.messages.push(vscode.LanguageModelChatMessage.Assistant(response));
    return this._parseDecideResponse(response);
  }

  async advanceToReview(): Promise<DraftMessage[]> {
    if (!this.model) return [{ kind: 'text', content: '⚠ Session not initialized.' }];
    this._phase = 'review';
    const today = new Date().toISOString().slice(0, 10);
    const reviewDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

    this.messages.push(vscode.LanguageModelChatMessage.User(
      `PHASE TRANSITION → GENERATE ADR\n\nGenerate the final ADR as markdown with YAML frontmatter. Rules:\n1. SHORT — max 2-3 sentences per section\n2. DIRECT — active voice, "We use X" not "It was decided"\n3. AUTO-LINKED — fill supersedes/amends/relates-to from our analysis\n\nFormat:\n---\ntitle: "..."\nstatus: proposed\ndate: ${today}\ndeciders: []\nsupersedes: [...]\namends: [...]\nrelates-to: [...]\ntags: [...]\nreview-by: ${reviewDate}\nconfidence: high|medium|low\n---\n# Title\n## Context\n## Decision\n## Consequences\n## Alternatives Considered\n\nOutput ONLY the markdown. No explanation, no code fences.`
    ));

    const response = await streamResponse(this.model, this.messages);
    this.messages.push(vscode.LanguageModelChatMessage.Assistant(response));
    return [{ kind: 'draft', content: response }];
  }

  // ===== Response Parsers (with text fallback) =====

  private _parseJSON(raw: string): unknown | null {
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  private _parseDescribeResponse(raw: string): DraftMessage[] {
    const data = this._parseJSON(raw) as { acknowledgment?: string; relatedAdrs?: string; questions?: { id: string; question: string; options: { label: string; description?: string }[] }[] } | null;
    if (!data || !data.questions) return [{ kind: 'text', content: raw }];

    const msgs: DraftMessage[] = [];
    const intro = [data.acknowledgment, data.relatedAdrs].filter(Boolean).join('\n\n');
    if (intro) msgs.push({ kind: 'text', content: intro });
    msgs.push({ kind: 'questions', intro: 'Help me understand your decision better:', questions: data.questions });
    return msgs;
  }

  private _parseContextResponse(raw: string): DraftMessage[] {
    const data = this._parseJSON(raw) as { summary?: string; impacts?: StructuredImpact[]; sideEffects?: string[]; constraints?: string } | null;
    if (!data) return [{ kind: 'text', content: raw }];

    const msgs: DraftMessage[] = [];
    if (data.summary) msgs.push({ kind: 'text', content: data.summary });
    if (data.impacts || data.sideEffects) {
      msgs.push({ kind: 'impact', summary: data.constraints || '', impacts: data.impacts || [], sideEffects: data.sideEffects || [] });
    }
    msgs.push({ kind: 'confirm', summary: 'Does this impact analysis look right?', actions: [
      { label: 'Yes, explore options', action: 'advance-options' },
      { label: 'I\'d change something', action: 'chat' },
    ]});
    return msgs;
  }

  private _parseOptionsResponse(raw: string): DraftMessage[] {
    const data = this._parseJSON(raw) as { intro?: string; options?: StructuredOption[]; recommendation?: string } | null;
    if (!data || !data.options) return [{ kind: 'text', content: raw }];

    return [{ kind: 'options', intro: data.intro || 'Here are the options:', options: data.options, recommendation: data.recommendation || undefined }];
  }

  private _parseDecideResponse(raw: string): DraftMessage[] {
    const data = this._parseJSON(raw) as { summary?: string; impacts?: StructuredImpact[]; confidence?: string; confidenceReason?: string; reviewDate?: string; warnings?: string[] } | null;
    if (!data) return [{ kind: 'text', content: raw }];

    const msgs: DraftMessage[] = [];
    let summaryText = data.summary || '';
    if (data.confidence) summaryText += `\n\n**Confidence:** ${data.confidence} — ${data.confidenceReason || ''}`;
    if (data.reviewDate) summaryText += `\n**Review by:** ${data.reviewDate}`;
    if (data.warnings?.length) summaryText += '\n\n**Watch out:**\n' + data.warnings.map(w => `- ${w}`).join('\n');
    msgs.push({ kind: 'text', content: summaryText });

    if (data.impacts?.length) {
      msgs.push({ kind: 'impact', summary: 'Final relationship map:', impacts: data.impacts, sideEffects: [] });
    }

    msgs.push({ kind: 'confirm', summary: 'Ready to generate the ADR?', actions: [
      { label: 'Generate ADR', action: 'generate' },
      { label: 'Go back to options', action: 'back-options' },
    ]});
    return msgs;
  }
}
