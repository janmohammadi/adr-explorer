import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { ExplorerViewProvider } from './explorerViewProvider';

export async function activate(context: vscode.ExtensionContext) {
  const repository = new AdrRepository();
  await repository.initialize();

  const explorerView = new ExplorerViewProvider(context.extensionUri, repository);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ExplorerViewProvider.sidebarViewType,
      explorerView,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand('adrExplorer.refresh', async () => {
      await repository.initialize();
      explorerView.sendData();
    }),
    repository,
  );
}

export function deactivate() {}
