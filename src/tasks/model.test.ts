import { expect, test } from 'vitest';
import { visibleTasks, type Task } from './model';
test('attention inbox and search keep actionable tasks discoverable', () => {
  const base = {
    brief: 'Handle streaming input',
    criteria: 'test',
    dependencies: [],
    assignedTo: 'agent',
    reason: '',
    updatedAt: 1,
    source: 'user',
    attempts: [],
  };
  const tasks: Task[] = [
    { ...base, id: '1', title: 'Parser', state: 'blocked' },
    { ...base, id: '2', title: 'Theme', state: 'done' },
    { ...base, id: '3', title: 'Review', state: 'review' },
  ];
  expect(visibleTasks(tasks, ' STREAMING ', true).map((t) => t.id)).toEqual([
    '1',
    '3',
  ]);
  expect(visibleTasks(tasks, 'theme', false).map((t) => t.id)).toEqual(['2']);
});
