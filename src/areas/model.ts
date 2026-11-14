export type Preview = {
  head: string;
  targetHead: string;
  target: string;
  tree: string;
};
export type Area = {
  id: string;
  name: string;
  repository: string;
  common: string;
  directory: string;
  branch: string;
  base: string;
  checks: Check[];
  findings: string;
  approval: Preview | null;
  operation: { kind: string; state: string; detail: string };
  integrated: string | null;
  removed: boolean;
};
export type Check = {
  head: string;
  name: string;
  state: 'passed' | 'failed' | 'notRun' | 'stale';
  detail: string;
};
export type AreaCatalog = { version: number; areas: Area[] };
export type Review = {
  head: string;
  status: string;
  files: string;
  diff: string;
  commits: string;
  checks: Check[];
  findings: string;
  approval: Preview | null;
};
/** Scope is a view over world-coordinate nodes; process ownership stays global. */
export const inArea = (node: { areaId?: string }, area: string | null) =>
  !area || node.areaId === area;
