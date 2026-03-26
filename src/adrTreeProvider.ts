import * as vscode from 'vscode';
import { AdrRecord, AdrStatus } from './types';
import { AdrRepository } from './adrRepository';

type TreeElement = StatusGroup | AdrTreeItem;

interface StatusGroup {
  kind: 'status-group';
  status: AdrStatus;
  label: string;
  icon: string;
}

interface AdrTreeItem {
  kind: 'adr';
  adr: AdrRecord;
}

const STATUS_ORDER: { status: AdrStatus; label: string; icon: string }[] = [
  { status: 'accepted', label: 'Accepted', icon: 'pass' },
  { status: 'proposed', label: 'Proposed', icon: 'question' },
  { status: 'deprecated', label: 'Deprecated', icon: 'warning' },
  { status: 'superseded', label: 'Superseded', icon: 'circle-slash' },
];

export class AdrTreeDataProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private repository: AdrRepository) {
    repository.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.kind === 'status-group') {
      const count = this.repository.getAdrsByStatus(element.status).length;
      const item = new vscode.TreeItem(
        `${element.label} (${count})`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.iconPath = new vscode.ThemeIcon(element.icon);
      return item;
    }

    const adr = element.adr;
    const item = new vscode.TreeItem(
      `${adr.id}: ${adr.title}`,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = adr.date;
    item.tooltip = new vscode.MarkdownString(
      `**${adr.title}**\n\n` +
      `Status: ${adr.status}\n\n` +
      `Date: ${adr.date}\n\n` +
      (adr.tags.length ? `Tags: ${adr.tags.join(', ')}` : '')
    );
    item.command = {
      command: 'adrExplorer.openAdrFile',
      title: 'Open ADR',
      arguments: [adr.filePath],
    };
    return item;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      return STATUS_ORDER
        .filter(s => this.repository.getAdrsByStatus(s.status).length > 0)
        .map(s => ({ kind: 'status-group' as const, ...s }));
    }
    if (element.kind === 'status-group') {
      return this.repository
        .getAdrsByStatus(element.status)
        .map(adr => ({ kind: 'adr' as const, adr }));
    }
    return [];
  }
}
