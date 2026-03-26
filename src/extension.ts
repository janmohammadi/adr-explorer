import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { ExplorerViewProvider } from './explorerViewProvider';

export async function activate(context: vscode.ExtensionContext) {
  const repository = new AdrRepository();
  await repository.initialize();

  const explorerView = new ExplorerViewProvider(context.extensionUri, repository);

  // Register an empty tree provider so the viewsWelcome content shows
  vscode.window.registerTreeDataProvider('adrExplorer.welcome', {
    getTreeItem: () => undefined as never,
    getChildren: () => [],
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('adrExplorer.openExplorerView', () => explorerView.show()),
    vscode.commands.registerCommand('adrExplorer.refresh', async () => {
      await repository.initialize();
    }),
    repository,
  );

  // Auto-open the explorer view on activation
  explorerView.show();
}

export function deactivate() {}
