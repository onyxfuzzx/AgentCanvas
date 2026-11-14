export type TaskStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'review'
  | 'done'
  | 'blocked'
  | 'failed'
  | 'cancelled';
export type Attempt = {
  id: string;
  generation: string;
  state:
    | 'dispatched'
    | 'acknowledged'
    | 'running'
    | 'cancelling'
    | 'interrupted'
    | 'completed'
    | 'cancelled';
  at: number;
  leaseUntil: number;
  summary: string;
  artifacts: string[];
  checkoutRef?: string | null;
};
export type Task = {
  id: string;
  title: string;
  brief: string;
  criteria: string;
  dependencies: string[];
  assignedTo: string;
  checkoutRef?: string | null;
  state: TaskStatus;
  reason: string;
  updatedAt: number;
  source: string;
  attempts: Attempt[];
};
export type TaskSnapshot = {
  board: { version: number; revision: number; tasks: Task[] };
  recovered: boolean;
  leaseMs: number;
};
export type TaskAction =
  | {
      type: 'create' | 'edit';
      id: string;
      title: string;
      brief: string;
      criteria: string;
      dependencies: string[];
      assignedTo: string;
    }
  | { type: 'ready' | 'accept' | 'cancel'; id: string }
  | { type: 'dispatch'; id: string; attemptId: string }
  | { type: 'checkout'; id: string; areaId: string | null }
  | { type: 'reject'; id: string; reason: string }
  | {
      type: 'resolve';
      id: string;
      outcome: 'draft' | 'ready' | 'failed' | 'cancelled';
    };
export function visibleTasks(
  tasks: Task[],
  search: string,
  attention: boolean,
) {
  const query = search.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (!attention || ['review', 'blocked', 'failed'].includes(t.state)) &&
      `${t.title}\n${t.brief}\n${t.id}`.toLowerCase().includes(query),
  );
}
