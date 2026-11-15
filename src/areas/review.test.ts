import { expect, test } from 'vitest';
import { gitPath, parseDiff } from './diff';
import {
  checksReady,
  findingsForCommit,
  independentReviews,
  integrationCommit,
  samePreview,
} from './review';
import type { AreaCatalog, Review } from './model';
import type { Task, TaskSnapshot } from '../tasks/model';
const review: Review = {
  head: 'abc',
  status: '',
  files: 'M\tfile.ts',
  diff: '',
  commits: '',
  checks: [{ head: 'abc', name: 'Tests', state: 'passed', detail: 'fixture' }],
  findings: 'Commit abc\nNo blockers recorded.',
  approval: null,
};
test('an uncertain integration journal never becomes a success notification', () => {
  const catalog = {
    version: 1,
    areas: [
      {
        id: 'area',
        integrated: 'merge',
        operation: { kind: 'integrate', state: 'complete', detail: '' },
      },
    ],
  } as AreaCatalog;
  expect(integrationCommit(catalog, 'area')).toBe('merge');
  expect(
    integrationCommit(
      {
        ...catalog,
        areas: [
          {
            ...catalog.areas[0],
            operation: {
              kind: 'integrate',
              state: 'uncertain',
              detail: 'Inspect target',
            },
          },
        ],
      },
      'area',
    ),
  ).toBeUndefined();
  expect(integrationCommit(catalog, 'missing')).toBeUndefined();
});
test('diff distinguishes metadata from added/deleted source that begins with header characters', () => {
  const [file] = parseDiff(
    'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -8,2 +8,2 @@\n---source\n+++source\n kept\n',
  );
  expect(file.path).toBe('file.ts');
  expect(file.additions).toBe(1);
  expect(file.deletions).toBe(1);
  expect(file.lines.slice(-3)).toEqual([
    { text: '---source', kind: 'del', before: 8 },
    { text: '+++source', kind: 'add', after: 8 },
    { text: ' kept', kind: 'context', before: 9, after: 9 },
  ]);
});
test('diff preserves deleted/binary paths and resets line numbers at every hunk', () => {
  const files = parseDiff(
    'diff --git a/old.txt b/old.txt\ndeleted file mode 100644\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\ndiff --git a/pic.png b/pic.png\nBinary files a/pic.png and b/pic.png differ\ndiff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -2 +2 @@\n-a\n+b\n@@ -40 +80 @@\n-c\n+d\n',
  );
  expect(files.map((f) => [f.path, f.status, f.binary])).toEqual([
    ['old.txt', 'D', false],
    ['pic.png', 'M', true],
    ['file', 'M', false],
  ]);
  expect(files[2].lines.at(-1)).toMatchObject({ kind: 'add', after: 80 });
});
test('quoted Git paths decode octal UTF-8, escapes, spaces and rename metadata', () => {
  expect(gitPath('"caf\\303\\251\\tfile.ts"')).toBe('caf\u00e9\tfile.ts');
  const [file] = parseDiff(
    'diff --git a/old name b/new name\nsimilarity index 100%\nrename from old name\nrename to new name\n',
  );
  expect(file).toMatchObject({
    path: 'new name',
    oldPath: 'old name',
    status: 'R',
    additions: 0,
    deletions: 0,
  });
});
test('approval requires current passing checks and compares both commits, target and merge tree', () => {
  expect(checksReady(review)).toBe(true);
  expect(checksReady({ ...review, status: '?? local.txt' })).toBe(false);
  expect(checksReady({ ...review, checks: [] })).toBe(false);
  expect(
    checksReady({ ...review, checks: [{ ...review.checks[0], head: 'old' }] }),
  ).toBe(false);
  const preview = {
    head: 'abc',
    targetHead: 'base',
    target: 'main',
    tree: 'tree',
  };
  expect(samePreview(preview, { ...preview })).toBe(true);
  for (const key of ['head', 'targetHead', 'target', 'tree'] as const)
    expect(samePreview(preview, { ...preview, [key]: 'changed' })).toBe(false);
  expect(samePreview(null, null)).toBe(false);
  expect(findingsForCommit({ ...review, head: 'new' }).current).toBe(false);
});
test('independent review stays stale when the commit or builder attempt changes', () => {
  const base: Task = {
    id: 'build',
    title: 'Build',
    brief: 'Brief',
    criteria: 'Checks',
    dependencies: [],
    assignedTo: 'builder',
    checkoutRef: 'area',
    state: 'review',
    reason: '',
    updatedAt: 0,
    source: 'user',
    attempts: [
      {
        id: 'a',
        generation: 'g',
        state: 'completed',
        at: 0,
        leaseUntil: 0,
        summary: '',
        artifacts: [],
      },
    ],
  };
  const reviewer: Task = {
    ...base,
    id: 'review',
    reviewOf: 'build',
    state: 'done',
    assignedTo: 'reviewer',
  };
  const snapshot = {
    board: {
      version: 1,
      revision: 1,
      tasks: [base, reviewer],
      orchestration: {
        reviews: [
          {
            builder: 'build',
            reviewer: 'review',
            head: 'abc',
            builderAttempt: 'a',
          },
        ],
      },
    },
  } as TaskSnapshot;
  expect(independentReviews('area', review, snapshot)[0].accepted).toBe(true);
  expect(
    independentReviews('area', { ...review, head: 'new' }, snapshot)[0]
      .accepted,
  ).toBe(false);
  const changed = {
    ...snapshot,
    board: {
      ...snapshot.board,
      tasks: [
        { ...base, attempts: [{ ...base.attempts[0], id: 'new-attempt' }] },
        reviewer,
      ],
    },
  };
  expect(independentReviews('area', review, changed)[0].accepted).toBe(false);
  const selfReview = {
    ...snapshot,
    board: {
      ...snapshot.board,
      tasks: [base, { ...reviewer, assignedTo: 'builder' }],
    },
  };
  expect(independentReviews('area', review, selfReview)[0].accepted).toBe(
    false,
  );
});
