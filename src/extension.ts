import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { AdrTreeDataProvider } from './adrTreeProvider';
import { GraphViewProvider } from './graphViewProvider';
import { TimelineViewProvider } from './timelineViewProvider';

export async function activate(context: vscode.ExtensionContext) {
  const repository = new AdrRepository();
  await repository.initialize();

  const treeProvider = new AdrTreeDataProvider(repository);
  vscode.window.registerTreeDataProvider('adrExplorer.list', treeProvider);

  const graphView = new GraphViewProvider(context.extensionUri, repository);
  const timelineView = new TimelineViewProvider(context.extensionUri, repository);

  context.subscriptions.push(
    vscode.commands.registerCommand('adrExplorer.openGraphView', () => graphView.show()),
    vscode.commands.registerCommand('adrExplorer.openTimelineView', () => timelineView.show()),
    vscode.commands.registerCommand('adrExplorer.refresh', async () => {
      await repository.initialize();
      treeProvider.refresh();
    }),
    vscode.commands.registerCommand('adrExplorer.openAdrFile', (filePath: string) => {
      vscode.workspace.openTextDocument(filePath).then(doc =>
        vscode.window.showTextDocument(doc)
      );
    }),
    repository,
  );
}

export function deactivate() {}
