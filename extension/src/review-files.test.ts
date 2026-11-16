import { expect, test } from 'vitest';
import { resolve } from 'node:path';
import { openReviewedFile } from './review-files';

test('review opening uses only the backend canonical file location, including Unicode and spaces', async () => {
  const location = resolve('managed checkout/世界.txt');
  const calls: unknown[] = [];
  await openReviewedFile(
    { workspaceId: 'workspace', id: 'area', relative: '世界.txt', line: 9 },
    {
      request: async (command, args) => {
        calls.push({ command, args });
        return location;
      },
      open: async (path, line) => {
        calls.push({ path, line });
      },
    },
  );
  expect(calls).toEqual([
    {
      command: 'area_file_location',
      args: { workspaceId: 'workspace', id: 'area', relative: '世界.txt' },
    },
    { path: location, line: 9 },
  ]);
});
test('native rejection and invalid editor requests never open a file', async () => {
  let opened = 0;
  const ports = {
    request: async () => {
      throw new Error('File escapes area');
    },
    open: async () => {
      opened++;
    },
  };
  await expect(
    openReviewedFile(
      { workspaceId: 'workspace', id: 'area', relative: '../secret' },
      ports,
    ),
  ).rejects.toThrow('escapes');
  for (const args of [
    null,
    { path: 'C:/secret' },
    { workspaceId: 'w', id: 'a', relative: 'file', line: -1 },
    { workspaceId: 'w', id: 'a', relative: 'file', line: 1.5 },
  ])
    await expect(openReviewedFile(args, ports)).rejects.toThrow(
      'Choose a file',
    );
  await expect(
    openReviewedFile(
      { workspaceId: 'w', id: 'a', relative: 'file' },
      { ...ports, request: async () => 'relative/path' },
    ),
  ).rejects.toThrow('invalid reviewed');
  expect(opened).toBe(0);
});
