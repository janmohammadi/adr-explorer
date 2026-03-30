import * as vscode from 'vscode';

const DISTILL_SOURCE = 'adr-distill';

export class DistillCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private diagnostics: vscode.DiagnosticCollection) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const diags = this.diagnostics.get(document.uri);
    if (!diags) return [];

    const actions: vscode.CodeAction[] = [];

    for (const diag of diags) {
      if (!diag.range.intersection(range)) continue;
      if (diag.source !== DISTILL_SOURCE) continue;

      // The replacement is stored in diag.code as a JSON string
      const meta = typeof diag.code === 'string' ? JSON.parse(diag.code) : null;
      if (!meta) continue;

      const action = new vscode.CodeAction(
        meta.replacement
          ? `Distill: Replace with "${truncate(meta.replacement, 60)}"`
          : 'Distill: Remove this text',
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = [diag];
      action.command = {
        title: 'Apply distill suggestion',
        command: 'adrExplorer.applyDistillFix',
        arguments: [document.uri, { target: meta.target, replacement: meta.replacement }],
      };
      actions.push(action);
    }

    return actions;
  }
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}
