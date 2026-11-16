import { expect, test } from 'vitest';
import { resolve } from 'node:path';
import { EditorProjects } from './projects';

const first = { name: 'First', path: resolve('project one') };
const second = { name: 'Second 世界', path: resolve('project two 世界') };
test('project defaults follow the active file, explicit selection, and removal of a root', () => {
  let folders = [first, second];
  let active: string | undefined = second.path;
  const projects = new EditorProjects({
    folders: () => folders,
    activeFolder: () => active,
    pickDirectory: async () => null,
  });
  projects.captureActiveFolder();
  active = undefined; // Focusing the canvas hides the active text editor.
  expect(projects.context().defaultCwd).toBe(second.path);
  expect(projects.select(first.path).defaultCwd).toBe(first.path);
  active = second.path;
  expect(projects.context().defaultCwd).toBe(first.path);
  folders = [second];
  expect(projects.context().defaultCwd).toBe(second.path);
  folders = [];
  expect(projects.context()).toEqual({ folders: [], defaultCwd: '' });
  expect(() => projects.select(first.path)).toThrow('currently open');
});
test('directory browsing preserves cancellation and custom launch paths without changing the selected project', async () => {
  const initial: (string | undefined)[] = [];
  let chosen: string | null = null;
  const projects = new EditorProjects({
    folders: () => [first],
    activeFolder: () => undefined,
    pickDirectory: async (path) => {
      initial.push(path);
      return chosen;
    },
  });
  expect(await projects.browse('relative/input')).toBeNull();
  expect(initial).toEqual([first.path]);
  chosen = resolve('custom launch 世界');
  expect(await projects.browse(second.path)).toBe(chosen);
  expect(initial[1]).toBe(second.path);
  expect(projects.context().defaultCwd).toBe(first.path);
  await expect(projects.browse('bad\0path')).rejects.toThrow();
  expect(() => projects.select(chosen)).toThrow();
});
