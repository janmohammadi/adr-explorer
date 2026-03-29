import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { ExplorerViewProvider } from './explorerViewProvider';

export async function activate(context: vscode.ExtensionContext) {
  const repository = new AdrRepository();
  await repository.initialize();

  const explorerView = new ExplorerViewProvider(context.extensionUri, repository);

  context.subscriptions.push(
    vscode.commands.registerCommand('adrExplorer.open', () => {
      explorerView.showPanel();
    }),
    vscode.commands.registerCommand('adrExplorer.refresh', async () => {
      await repository.initialize();
      explorerView.sendData();
    }),
    repository,
  );

  // Open the explorer tab directly on activation
  explorerView.showPanel();
}

export function deactivate() {}
