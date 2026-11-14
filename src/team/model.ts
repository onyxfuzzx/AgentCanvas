import type { TaskSnapshot } from '../tasks/model';
import type { CanvasNode } from '../canvas/model';
export type Limits = {
  concurrency: number;
  queue: number;
  attempts: number;
  dispatches: number;
  runtimeMs: number;
  backoffMs: number;
};
export type Permissions = {
  dispatch: boolean;
  messaging: boolean;
  launch: boolean;
  provision: boolean;
  checks: boolean;
  integrate: boolean;
};
export type Job = {
  id: string;
  title: string;
  brief: string;
  criteria: string;
  dependencies: string[];
  agent: string;
  area: string | null;
  reviewer: string | null;
  reviewTask: string | null;
};
export type Plan = {
  goal: string;
  jobs: Job[];
  checks: {
    id: string;
    task: string;
    name: string;
    program: string;
    args: string[];
    timeoutMs: number;
  }[];
  repositories: string[];
};
export type Run = {
  id: string;
  goal: string;
  coordinator: string | null;
  state: string;
  reason: string;
  limits: Limits;
  permissions: Permissions;
  plan: Plan | null;
  proposal: Plan | null;
  tasks: string[];
  reviews: {
    builder: string;
    reviewer: string;
    head: string | null;
    builderAttempt: string | null;
  }[];
  elapsedMs: number;
  dispatched: number;
  events: {
    at: number;
    source: string;
    kind: string;
    task: string | null;
    detail: string;
  }[];
};
export type TeamSnapshot = {
  snapshot: TaskSnapshot;
  agents: { node: CanvasNode; live: boolean; stopping: boolean }[];
  schedulerError: string | null;
  activeCheck: string | null;
  usage: { tokens: null; cost: null; source: string };
};
export const defaultLimits: Limits = {
  concurrency: 2,
  queue: 32,
  attempts: 3,
  dispatches: 24,
  runtimeMs: 3600000,
  backoffMs: 5000,
};
export const defaultPermissions: Permissions = {
  dispatch: true,
  messaging: false,
  launch: false,
  provision: false,
  checks: false,
  integrate: false,
};
export function parsePlan(source: string): Plan {
  if (new TextEncoder().encode(source).length > 128 * 1024)
    throw new Error('Plan exceeds 128 KiB');
  const value: unknown = JSON.parse(source);
  if (
    !value ||
    typeof value !== 'object' ||
    !('jobs' in value) ||
    !Array.isArray(value.jobs)
  )
    throw new Error('A plan must contain a jobs array');
  return value as Plan;
}
