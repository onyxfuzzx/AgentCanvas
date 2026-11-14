import { expect, test } from 'vitest';
import { taskMove } from './board';
import type { Task } from './model';
const task: Task = {
  id: 'one',
  title: 'Build',
  brief: 'Brief',
  criteria: 'Checks',
  dependencies: [],
  assignedTo: 'agent',
  state: 'ready',
  reason: '',
  updatedAt: 1,
  source: 'user',
  attempts: [],
};
test('board actions dispatch through the native protocol and require a submitted result for acceptance', () => {
  expect(taskMove(task, 'running', [task])).toMatchObject({
    allowed: true,
    action: { type: 'dispatch', id: 'one' },
  });
  expect(taskMove({ ...task, state: 'running' }, 'done', [task]).allowed).toBe(
    false,
  );
  expect(
    taskMove({ ...task, state: 'running' }, 'review', [task]).allowed,
  ).toBe(false);
  expect(taskMove({ ...task, state: 'review' }, 'done', [task])).toMatchObject({
    allowed: true,
    action: { type: 'accept', id: 'one' },
  });
});
test('dispatch waits for dependencies and permits independent review of a submitted builder result', () => {
  const dependency = { ...task, id: 'builder', state: 'review' as const };
  const dependent = { ...task, dependencies: ['builder'] };
  expect(taskMove(dependent, 'running', [dependency]).allowed).toBe(false);
  expect(
    taskMove({ ...dependent, reviewOf: 'builder' }, 'running', [dependency])
      .allowed,
  ).toBe(true);
  expect(taskMove(dependent, 'running', []).allowed).toBe(false);
});
test('board cannot start duplicate writers or silently reconcile uncertain attempts', () => {
  const other: Task = {
    ...task,
    id: 'other',
    checkoutRef: 'area',
    attempts: [
      {
        id: 'attempt',
        generation: 'g',
        state: 'interrupted',
        at: 1,
        leaseUntil: 2,
        summary: '',
        artifacts: [],
      },
    ],
  };
  expect(taskMove(task, 'running', [other]).allowed).toBe(false);
  expect(
    taskMove(
      { ...task, assignedTo: 'different', checkoutRef: 'area' },
      'running',
      [other],
    ).allowed,
  ).toBe(false);
  expect(
    taskMove({ ...other, state: 'blocked' }, 'ready', [other]).allowed,
  ).toBe(false);
  expect(taskMove({ ...task, state: 'failed' }, 'ready', [])).toMatchObject({
    allowed: true,
    action: { type: 'resolve', outcome: 'ready' },
  });
});
test('marking drafts ready does not dispatch, and completed tasks cannot restart', () => {
  expect(taskMove({ ...task, state: 'draft' }, 'ready', [])).toMatchObject({
    allowed: true,
    action: { type: 'ready' },
  });
  for (const state of ['done', 'cancelled'] as const)
    for (const target of ['ready', 'running', 'review', 'done'] as const)
      expect(taskMove({ ...task, state }, target, []).allowed).toBe(false);
});
