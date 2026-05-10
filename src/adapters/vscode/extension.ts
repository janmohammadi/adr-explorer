import * as vscode from 'vscode';
import { AdrRepository } from '../../core/repository';
import { MessageRouter } from '../../core/messageRouter';
import { VsCodeFileSystem } from './fileSystem';
import { VsCodeLmProvider } from './lmProvider';
import { VsCodeWebviewHost } from './webviewHost';
import { DistillCodeActionProvider } from './distillCodeActions';

export async function activate(context: vscode.ExtensionContext) {
  const fs = new VsCodeFileSystem();
  const rootDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const repository = new AdrRepository(fs, rootDir);
  await repository.initialize();

  const diagnostics = vscode.languages.createDiagnosticCollection('adr-distill');
  const codeActionProvider = new DistillCodeActionProvider(diagnostics);

  const host = new VsCodeWebviewHost(context.extensionUri, diagnostics);
  const lm = new VsCodeLmProvider();

  const router = new MessageRouter(
    repository,
    host,
    fs,
    { aiEnabled: true, canEditFiles: true, canOpenInEditor: true },
    lm,
  );
  const routerAttachment = router.attach();

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(layout) ADR Explorer';
  statusBarItem.tooltip = 'Open ADR Explorer';
  statusBarItem.command = 'adrExplorer.open';
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand('adrExplorer.open', () => {
      const opening = !host.isOpen;
      host.showPanel();
      if (opening) {
        // Send the first snapshot so the panel renders even if the webview's
        // 'ready' message races with this command.
        router.sendData();
      }
    }),
    vscode.commands.registerCommand('adrExplorer.refresh', async () => {
      await repository.initialize();
      router.sendData();
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
    { dispose: () => routerAttachment.dispose() },
    { dispose: () => repository.dispose() },
  );
}

export function deactivate() {}
