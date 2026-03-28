import * as vscode from 'vscode';
import { AdrRecord } from './types';

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
    (adr.relatesTo.length ? ` relates-to:[${adr.relatesTo.map(r => r.id).join(',')}]` : '');
}

// ===== AI Tools =====

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
