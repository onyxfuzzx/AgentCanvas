import { afterEach, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  link,
  mkdir,
  open,
} from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NativeHost } from './host';
import { RecoveryStore, type RecoverySave } from './recovery';

const temporary: string[] = [];
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'agentcanvas-recovery-'));
  temporary.push(folder);
  return { folder, store: new RecoveryStore(folder) };
}
afterEach(async () => {
  for (const folder of temporary.splice(0))
    await rm(folder, { recursive: true, force: true });
});
function note(workspaceId = randomUUID()): RecoverySave {
  return {
    command: 'note_save',
    args: {
      workspaceId,
      relativePath: `notes/${randomUUID()}.md`,
      expected: 'baseline',
      content: '<script>untrusted</script> 世界\nPending draft',
    },
  };
}

test('old version-1 drafts remain discoverable and inspectable without a backend', async () => {
  const { folder, store } = await fixture();
  const save = note();
  const file = await store.preserve([save]);
  const before = await readFile(file);
  expect((await store.list()).map((entry) => entry.id)).toEqual([
    file.split(/[\\/]/).pop(),
  ]);
  const draft = await store.inspect((await store.list())[0].id);
  expect(draft.saves).toEqual([save]);
  expect(await readFile(file)).toEqual(before);
  expect(await new RecoveryStore(join(folder, 'unused')).list()).toEqual([]);
  await expect(store.inspect('../workspace.json')).rejects.toThrow(
    'identifier',
  );
});

test('malformed, unsupported, duplicate and privileged drafts are refused without modifying originals', async () => {
  const { folder, store } = await fixture();
  const save = note();
  await store.preserve([save]);
  const id = (await store.list())[0].id;
  for (const body of [
    '{',
    JSON.stringify({ version: 2, saves: [save] }),
    JSON.stringify({ version: 1, saves: [save, save] }),
    JSON.stringify({
      version: 1,
      saves: [{ command: 'terminal_spawn', args: {} }],
    }),
    JSON.stringify({
      version: 1,
      saves: [
        { ...save, args: { ...save.args, relativePath: '../outside.md' } },
      ],
    }),
  ]) {
    await writeFile(join(folder, 'recovery', id), body);
    await expect(store.inspect(id)).rejects.toThrow();
    expect(await readFile(join(folder, 'recovery', id), 'utf8')).toBe(body);
  }
});

test('oversized files and linked files are not read as recovery drafts', async () => {
  const { folder, store } = await fixture();
  await mkdir(join(folder, 'recovery'));
  const id = `drafts-${randomUUID()}.json`;
  const large = await open(join(folder, 'recovery', id), 'wx');
  try {
    await large.truncate(64 * 1024 * 1024 + 1);
  } finally {
    await large.close();
  }
  await expect(store.inspect(id)).rejects.toThrow('size limit');
  const source = join(folder, 'outside.json');
  const linked = `drafts-${randomUUID()}.json`;
  await writeFile(source, JSON.stringify({ version: 1, saves: [note()] }));
  await link(source, join(folder, 'recovery', linked));
  await expect(store.inspect(linked)).rejects.toThrow('without links');
});

test('stale previews cannot restore changed files or invoke native operations', async () => {
  const { folder, store } = await fixture();
  const save = note();
  await store.preserve([save]);
  const draft = await store.inspect((await store.list())[0].id);
  await writeFile(
    join(folder, 'recovery', draft.id),
    JSON.stringify({ version: 1, saves: [] }),
  );
  const calls: string[] = [];
  await expect(
    store.restore(
      draft,
      save.command === 'note_save' ? save.args.workspaceId : '',
      {
        request: async (command) => {
          calls.push(command);
        },
      },
    ),
  ).rejects.toThrow('changed');
  expect(calls).toEqual([]);
});

const program = resolve(
  process.env.AGENTCANVAS_EDITOR_TEST_BINARY ||
    'extension/native/agentcanvas-editor.exe',
);
const nativeTest = test.skipIf(
  process.platform !== 'win32' || !existsSync(program),
);

nativeTest(
  'failed saves retain drafts and the partial copy, release its lock and allow an explicit retry',
  async () => {
    const { folder, store } = await fixture();
    const host = new NativeHost(program, folder, homedir(), () => {});
    try {
      const save = note();
      if (save.command !== 'note_save') throw new Error('fixture');
      const original = await store.preserve([save]);
      const before = await readFile(original);
      const draft = await store.inspect((await store.list())[0].id);
      await expect(
        store.restore(draft, save.args.workspaceId, {
          request: (command, args) =>
            command === 'note_save'
              ? Promise.reject(new Error('Injected disk failure'))
              : host.request(command, args),
        }),
      ).rejects.toThrow('A partial copy remains at');
      expect(await readFile(original)).toEqual(before);
      const catalog = (await host.request('workspace_list')) as {
        entries: { id: string }[];
      };
      expect(catalog.entries).toHaveLength(1);
      const other = new NativeHost(program, folder, homedir(), () => {});
      try {
        await other.request('workspace_open', { id: catalog.entries[0].id });
      } finally {
        await other.stop();
      }
      const retry = store.restore(draft, save.args.workspaceId, host);
      await expect(
        store.restore(draft, save.args.workspaceId, host),
      ).rejects.toThrow('already being saved');
      const result = await retry;
      expect(
        await readFile(join(result.folder, save.args.relativePath), 'utf8'),
      ).toBe(save.args.content);
      expect(
        ((await host.request('workspace_list')) as { entries: unknown[] })
          .entries,
      ).toHaveLength(2);
    } finally {
      await host.stop();
    }
  },
  15000,
);

nativeTest(
  'native recovery copies layout, pending/conflicting notes and saved notes without changing originals or launching processes',
  async () => {
    const { folder, store } = await fixture();
    const host = new NativeHost(program, folder, homedir(), () => {});
    const workspaceId = randomUUID(),
      terminal = randomUUID(),
      otherTerminal = randomUUID(),
      first = randomUUID(),
      second = randomUUID();
    const firstPath = `notes/${first}.md`,
      secondPath = `notes/${second}.md`;
    const calls: string[] = [];
    const port = {
      request: (command: string, args?: Record<string, unknown>) => {
        calls.push(command);
        return host.request(command, args);
      },
    };
    try {
      const loaded = (await host.request('workspace_create', {
        id: workspaceId,
        name: 'Original',
        folder: null,
      })) as { folder: string };
      for (const id of [first, second])
        await host.request('note_create', { workspaceId, id });
      const original = await host.request('note_read', {
        workspaceId,
        relativePath: firstPath,
      });
      const layout = {
        nodes: [
          {
            id: terminal,
            kind: 'terminal',
            shell: 'cmd',
            cwd: folder,
            title: 'Worker',
            color: '#123456',
            x: 0,
            y: 0,
            width: 600,
            height: 400,
            z: 1,
            areaId: randomUUID(),
          },
          {
            id: otherTerminal,
            kind: 'terminal',
            shell: 'cmd',
            cwd: '',
            title: 'Other',
            color: '#123456',
            x: 0,
            y: 500,
            width: 600,
            height: 400,
            z: 2,
          },
          ...[first, second].map((id, index) => ({
            id,
            kind: 'note',
            relativePath: `notes/${id}.md`,
            title: 'Note',
            color: '#123456',
            x: 700,
            y: index * 400,
            width: 420,
            height: 300,
            z: index + 3,
          })),
        ],
        edges: [
          {
            id: randomUUID(),
            source: terminal,
            target: otherTerminal,
            kind: 'agent',
            policy: 'auto',
          },
        ],
        viewport: { x: 72, y: 72, zoom: 1 },
        settings: { snapGrid: false },
      };
      await host.request('workspace_save', { id: workspaceId, layout });
      await host.request('note_save', {
        workspaceId,
        relativePath: firstPath,
        expected: original,
        content: 'External edit that must survive',
      });
      const beforeLayout = await readFile(
        join(loaded.folder, 'workspace.json'),
      );
      const beforeNote = await readFile(join(loaded.folder, firstPath));
      await store.preserve([
        { command: 'workspace_save', args: { id: workspaceId, layout } },
        {
          command: 'note_save',
          args: {
            workspaceId,
            relativePath: firstPath,
            expected: original,
            content: 'Recovered pending content 世界',
          },
        },
      ]);
      const draft = await store.inspect((await store.list())[0].id);
      const beforeDraft = await readFile(join(folder, 'recovery', draft.id));
      const copy = await store.restore(draft, workspaceId, port);
      expect(copy.workspaceId).not.toBe(workspaceId);
      const saved = JSON.parse(
        await readFile(join(copy.folder, 'workspace.json'), 'utf8'),
      );
      expect(saved.nodes).toHaveLength(4);
      expect(saved.nodes[0].areaId).toBeUndefined();
      expect(saved.nodes[1].cwd).toBeTruthy();
      expect(saved.edges[0].policy).toBe('approval');
      expect(await readFile(join(copy.folder, firstPath), 'utf8')).toBe(
        'Recovered pending content 世界',
      );
      expect(await readFile(join(copy.folder, secondPath))).toEqual(
        await readFile(join(loaded.folder, secondPath)),
      );
      expect(await readFile(join(loaded.folder, 'workspace.json'))).toEqual(
        beforeLayout,
      );
      expect(await readFile(join(loaded.folder, firstPath))).toEqual(
        beforeNote,
      );
      expect(await readFile(join(folder, 'recovery', draft.id))).toEqual(
        beforeDraft,
      );
      expect(
        calls.some((command) =>
          /spawn|activate|team_|terminal_|collaboration/.test(command),
        ),
      ).toBe(false);
      expect(existsSync(join(copy.folder, 'tasks.json'))).toBe(false);
      const again = await store.restore(draft, workspaceId, port);
      expect(again).toEqual(copy);
      expect(
        calls.filter((command) => command === 'workspace_create'),
      ).toHaveLength(1);
    } finally {
      await host.stop();
    }
  },
  30000,
);

nativeTest(
  'note-only recovery works without the original workspace; invalid geometry cannot create a workspace',
  async () => {
    const { folder, store } = await fixture();
    const host = new NativeHost(program, folder, homedir(), () => {});
    try {
      const save = note();
      if (save.command !== 'note_save') throw new Error('fixture');
      await store.preserve([
        save,
        {
          command: 'workspace_save',
          args: {
            id: save.args.workspaceId,
            layout: {
              nodes: [
                {
                  id: randomUUID(),
                  kind: 'note',
                  title: 'Unavailable saved note',
                  relativePath: `notes/${randomUUID()}.md`,
                  color: '#123456',
                  x: 0,
                  y: 0,
                  width: 420,
                  height: 300,
                  z: 1,
                },
              ],
              edges: [],
              viewport: { x: 0, y: 0, zoom: 1 },
              settings: { snapGrid: false },
            },
          },
        },
      ]);
      const draft = await store.inspect((await store.list())[0].id);
      await expect(
        store.restore(draft, save.args.workspaceId, host),
      ).rejects.toThrow('Original workspaces and recovery drafts were kept');
      const copy = await store.restore(
        draft,
        save.args.workspaceId,
        host,
        true,
      );
      expect(
        await readFile(join(copy.folder, save.args.relativePath), 'utf8'),
      ).toBe(save.args.content);
      const layout = JSON.parse(
        await readFile(join(copy.folder, 'workspace.json'), 'utf8'),
      );
      expect(layout.nodes).toHaveLength(1);
      await store.preserve([
        {
          command: 'workspace_save',
          args: {
            id: randomUUID(),
            layout: {
              nodes: [],
              edges: [],
              viewport: { x: 0, y: 0, zoom: -1 },
              settings: { snapGrid: false },
            },
          },
        },
      ]);
      const bad = await store.inspect((await store.list())[0].id);
      const badSave = bad.saves[0];
      if (badSave.command !== 'workspace_save') throw new Error('fixture');
      await expect(store.restore(bad, badSave.args.id, host)).rejects.toThrow(
        'viewport',
      );
      const catalog = (await host.request('workspace_list')) as {
        entries: unknown[];
        lastActive: string | null;
      };
      expect(catalog.entries).toHaveLength(1);
      expect(catalog.lastActive).toBeNull();
    } finally {
      await host.stop();
    }
  },
  15000,
);

nativeTest(
  'source locks refuse recovery before creating a copy and release cleanly for retry',
  async () => {
    const { folder, store } = await fixture();
    const source = new NativeHost(program, folder, homedir(), () => {});
    const reader = new NativeHost(program, folder, homedir(), () => {});
    try {
      const id = randomUUID(),
        nodeId = randomUUID();
      await source.request('workspace_create', {
        id,
        name: 'Locked',
        folder: null,
      });
      const relativePath = await source.request('note_create', {
        workspaceId: id,
        id: nodeId,
      });
      const layout = {
        nodes: [
          {
            id: nodeId,
            kind: 'note',
            title: 'Saved',
            relativePath,
            color: '#123456',
            x: 0,
            y: 0,
            width: 420,
            height: 300,
            z: 1,
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        settings: { snapGrid: false },
      };
      await store.preserve([
        { command: 'workspace_save', args: { id, layout } },
      ]);
      const draft = await store.inspect((await store.list())[0].id);
      await expect(store.restore(draft, id, reader)).rejects.toThrow(
        'Original workspaces and recovery drafts were kept',
      );
      expect(
        ((await reader.request('workspace_list')) as { entries: unknown[] })
          .entries,
      ).toHaveLength(1);
      await source.stop();
      const copy = await store.restore(draft, id, reader);
      expect(existsSync(join(copy.folder, String(relativePath)))).toBe(true);
    } finally {
      await source.stop();
      await reader.stop();
    }
  },
  15000,
);
