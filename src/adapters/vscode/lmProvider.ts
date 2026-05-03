import * as vscode from 'vscode';
import { LMProvider } from '../../core/lmProvider';

const PREFERRED_FAMILIES = ['claude-opus-4', 'claude-sonnet-4', 'claude-3.5-sonnet'];

async function selectModel(): Promise<vscode.LanguageModelChat> {
  for (const family of PREFERRED_FAMILIES) {
    const models = await vscode.lm.selectChatModels({ family });
    if (models.length > 0) return models[0];
  }
  const allModels = await vscode.lm.selectChatModels();
  if (allModels.length === 0) {
    throw new Error('No language model available. Please ensure GitHub Copilot is installed and signed in.');
  }
  return allModels[0];
}

export class VsCodeLmProvider implements LMProvider {
  async *sendRequest(
    systemPrompt: string,
    userContent: string,
    signal: AbortSignal,
  ): AsyncIterable<string> {
    const model = await selectModel();

    const tokenSource = new vscode.CancellationTokenSource();
    const onAbort = () => tokenSource.cancel();
    if (signal.aborted) tokenSource.cancel();
    signal.addEventListener('abort', onAbort);

    try {
      const messages = [
        vscode.LanguageModelChatMessage.User(systemPrompt),
        vscode.LanguageModelChatMessage.User(userContent),
      ];
      const response = await model.sendRequest(messages, {}, tokenSource.token);
      for await (const chunk of response.text) {
        yield chunk;
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      tokenSource.dispose();
    }
  }
}
