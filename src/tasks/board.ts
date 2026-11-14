import type { Task, TaskAction } from './model';

export type BoardColumn = 'ready' | 'running' | 'review' | 'done';
export const boardColumns = [
  ['ready', 'Ready'],
  ['running', 'In progress'],
  ['review', 'Review'],
  ['done', 'Done'],
] as const;
export type TaskMove =
  | { allowed: false; reason: string }
  | {
      allowed: true;
      label: string;
      action:
        | Exclude<TaskAction, { type: 'dispatch' }>
        | { type: 'dispatch'; id: string };
    };

/** UI affordances only: Rust still validates revisions, permissions and live processes. */
export function taskMove(
  task: Task,
  target: BoardColumn,
  tasks: Task[],
): TaskMove {
  if (target === 'ready' && task.state === 'draft')
    return {
      allowed: true,
      label: 'Mark ready',
      action: { type: 'ready', id: task.id },
    };
  if (target === 'running' && task.state === 'ready') {
    if (
      task.dependencies.some(
        (id) =>
          !tasks.some(
            (d) =>
              d.id === id &&
              (d.state === 'done' ||
                (task.reviewOf === id && d.state === 'review')),
          ),
      )
    )
      return {
        allowed: false,
        reason: 'Waiting for dependencies to be accepted.',
      };
    if (
      tasks.some(
        (other) =>
          other.id !== task.id &&
          (other.assignedTo === task.assignedTo ||
            (Boolean(task.checkoutRef) &&
              other.checkoutRef === task.checkoutRef)) &&
          other.attempts.some(
            (a, i) =>
              i === other.attempts.length - 1 &&
              [
                'dispatched',
                'acknowledged',
                'running',
                'cancelling',
                'interrupted',
              ].includes(a.state),
          ),
      )
    )
      return {
        allowed: false,
        reason: 'The agent or checkout has active or unreconciled work.',
      };
    return {
      allowed: true,
      label: 'Dispatch to assigned agent',
      action: { type: 'dispatch', id: task.id },
    };
  }
  if (target === 'done' && task.state === 'review')
    return {
      allowed: true,
      label: 'Accept result',
      action: { type: 'accept', id: task.id },
    };
  if (target === 'ready' && ['blocked', 'failed'].includes(task.state)) {
    if (
      task.attempts.some(
        (a, i) =>
          i === task.attempts.length - 1 &&
          [
            'dispatched',
            'acknowledged',
            'running',
            'cancelling',
            'interrupted',
          ].includes(a.state),
      )
    )
      return {
        allowed: false,
        reason: 'Stop and reconcile the last attempt in task details first.',
      };
    return {
      allowed: true,
      label: 'Resolve as ready',
      action: { type: 'resolve', id: task.id, outcome: 'ready' },
    };
  }
  if (target === 'review')
    return {
      allowed: false,
      reason: 'The assigned agent must submit a result before review.',
    };
  if (task.state === 'done' || task.state === 'cancelled')
    return {
      allowed: false,
      reason: 'Finished and cancelled tasks cannot be reopened by dragging.',
    };
  return {
    allowed: false,
    reason:
      'Use task details to stop work, request revisions, or reconcile an attempt.',
  };
}
