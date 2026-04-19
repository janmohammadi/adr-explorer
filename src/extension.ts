import * as vscode from 'vscode';
import { AdrRepository } from './adrRepository';
import { ExplorerViewProvider } from './explorerViewProvider';
import { DistillCodeActionProvider } from './distillCodeActions';

export async function activate(context: vscode.ExtensionContext) {
  const repository = new AdrRepository();
  await repository.initialize();

  const diagnostics = vscode.languages.createDiagnosticCollection('adr-distill');
  const codeActionProvider = new DistillCodeActionProvider(diagnostics);

  const explorerView = new ExplorerViewProvider(context.extensionUri, repository, diagnostics);

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(layout) ADR Explorer';
  statusBarItem.tooltip = 'Open ADR Explorer';
  statusBarItem.command = 'adrExplorer.open';
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand('adrExplorer.open', () => {
      explorerView.showPanel();
    }),
    vscode.commands.registerCommand('adrExplorer.refresh', async () => {
      await repository.initialize();
      explorerView.sendData();
    }),
    vscode.commands.registerCommand('adrExplorer.applyDistillFix', async (uri: vscode.Uri, suggestion: { target: string; replacement: string }) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();
      const idx = text.indexOf(suggestion.target);
      if (idx === -1) {
        vscode.window.showWarningMessage('Target text not found — it may have already been changed.');
        return;
      }
      const startPos = doc.positionAt(idx);
      const endPos = doc.positionAt(idx + suggestion.target.length);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(startPos, endPos), suggestion.replacement);
      await vscode.workspace.applyEdit(edit);
      await doc.save();
    }),
    vscode.languages.registerCodeActionsProvider(
      { language: 'markdown', scheme: 'file' },
      codeActionProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    ),
    diagnostics,
    repository,
  );

}

export function deactivate() {}
