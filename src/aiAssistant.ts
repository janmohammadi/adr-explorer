import * as vscode from 'vscode';
import { AdrRecord } from './types';

async function getModel(): Promise<vscode.LanguageModelChat | null> {
  try {
    // Try to find a Claude model first, fall back to any available
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
  return `- ${adr.id}: "${adr.title}" [${adr.status}] (${adr.date}) tags:[${adr.tags.join(',')}]`;
}

export async function generateClusterSummary(adrs: AdrRecord[]): Promise<string> {
  const model = await getModel();
  if (!model) return '⚠ No language model available. Install a VS Code language model extension (e.g., GitHub Copilot, Claude for VS Code).';

  const adrList = adrs.map(adrSummary).join('\n');
  const prompt = `You are an architecture advisor. Given these Architecture Decision Records (ADRs), write a concise narrative (3-5 sentences) explaining how they relate to each other and their combined architectural direction. Focus on the strategic picture, not individual details.

ADRs:
${adrList}`;

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  return streamResponse(model, messages);
}

export async function generateGapAnalysis(adrs: AdrRecord[]): Promise<string> {
  const model = await getModel();
  if (!model) return '⚠ No language model available. Install a VS Code language model extension.';

  const adrList = adrs.map(adrSummary).join('\n');
  const allTags = [...new Set(adrs.flatMap(a => a.tags))].sort();

  const prompt = `You are an architecture advisor reviewing a portfolio of Architecture Decision Records (ADRs). Analyze the existing decisions and suggest what decisions might be MISSING — areas where architectural decisions should exist but don't.

Consider common architectural concerns: security, scalability, data management, error handling, testing strategy, deployment, monitoring/observability, API design, authentication, authorization, caching, etc.

Current ADRs:
${adrList}

Current tags in use: ${allTags.join(', ')}

Provide 3-5 specific suggestions for missing ADRs, each with a proposed title and brief justification (1-2 sentences). Format as a numbered list.`;

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  return streamResponse(model, messages);
}

export async function generateStakeholderBrief(adr: AdrRecord): Promise<string> {
  const model = await getModel();
  if (!model) return '⚠ No language model available. Install a VS Code language model extension.';

  const prompt = `You are an architecture advisor. Write a brief, non-technical stakeholder summary of this Architecture Decision Record. The audience is project managers and business stakeholders who need to understand the impact without technical jargon.

ADR: ${adr.id} - "${adr.title}"
Status: ${adr.status}
Date: ${adr.date}
Tags: ${adr.tags.join(', ')}

Full content:
${adr.content}

Write 3-4 sentences covering: what was decided, why it matters for the project, and what the practical impact is.`;

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  return streamResponse(model, messages);
}

export async function generateAdrDraft(description: string, existingAdrs: AdrRecord[]): Promise<string> {
  const model = await getModel();
  if (!model) return '⚠ No language model available. Install a VS Code language model extension.';

  const existingList = existingAdrs.map(adrSummary).join('\n');
  const allTags = [...new Set(existingAdrs.flatMap(a => a.tags))].sort();

  const prompt = `You are an architecture advisor. Generate a well-structured Architecture Decision Record (ADR) based on this description:

"${description}"

Existing ADRs for context:
${existingList}

Existing tags: ${allTags.join(', ')}

Generate a complete ADR in markdown with YAML frontmatter. Use this format:
---
title: "..."
status: proposed
date: ${new Date().toISOString().slice(0, 10)}
deciders: []
supersedes: []
amends: []
relates-to: []
tags: [pick relevant tags from the existing set or suggest new ones]
review-by: ${new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)}
confidence: medium
---

# Title

## Context
[Describe the problem/need]

## Decision
[Describe the decision]

## Consequences
### Positive
- ...
### Negative
- ...

## Alternatives Considered
- ...`;

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  return streamResponse(model, messages);
}
