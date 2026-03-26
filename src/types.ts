export type AdrStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';

export interface AdrRecord {
  /** Derived from filename, e.g., "ADR-0001" */
  id: string;
  /** Numeric portion for sorting */
  number: number;
  title: string;
  status: AdrStatus;
  date: string;
  deciders: string[];
  supersedes: string[];
  amends: string[];
  relatesTo: string[];
  tags: string[];
  filePath: string;
  content: string;
}

export interface AdrEdge {
  source: string;
  target: string;
  type: 'supersedes' | 'amends' | 'relates-to';
}

export type ExtensionToWebviewMessage =
  | { type: 'update'; adrs: AdrRecord[]; edges: AdrEdge[] }
  | { type: 'focusNode'; adrId: string };

export type WebviewToExtensionMessage =
  | { type: 'openFile'; filePath: string }
  | { type: 'requestData' }
  | { type: 'ready' };
