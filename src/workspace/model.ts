import type { CanvasNode, Viewport } from '../canvas/model';
export type WorkspaceLayout = {
  nodes: CanvasNode[];
  viewport: Viewport;
  settings: { snapGrid: boolean };
  edges: never[];
};
export type WorkspaceDocument = WorkspaceLayout & {
  version: 1;
  id: string;
  name: string;
  revision: number;
};
export type WorkspaceEntry = { id: string; name: string; folder: string };
export type Catalog = {
  entries: WorkspaceEntry[];
  lastActive: string | null;
  recovered: boolean;
  defaultFolder: string;
};
export type LoadedWorkspace = {
  document: WorkspaceDocument;
  folder: string;
  recovered: boolean;
};
