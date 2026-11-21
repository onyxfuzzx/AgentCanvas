import { expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NativeHost } from './host';

const program = resolve(
  process.env.AGENTCANVAS_EDITOR_TEST_BINARY ||
    'extension/native/agentcanvas-editor.exe',
);

test.skipIf(process.platform !== 'win32' || !existsSync(program))(
  'crashing the supervisor kills its shell tree before a replacement opens the same workspace',
  async () => {
    const data = await mkdtemp(join(tmpdir(), 'agentcanvas-crash-test-'));
    const failed: Error[] = [];
    const host = new NativeHost(
      program,
      data,
      homedir(),
      () => {},
      (error) => failed.push(error),
    );
    const workspaceId = randomUUID(),
      id = randomUUID();
    let shellPid = 0;
    try {
      await host.request('workspace_create', {
        id: workspaceId,
        name: 'Crash recovery',
        folder: null,
      });
      await host.request('collaboration_sync', {
        workspaceId,
        layout: {
          nodes: [
            {
              id,
              kind: 'terminal',
              title: 'Crash fixture',
              color: '#708f7c',
              shell: 'powershell',
              cwd: data,
              x: 0,
              y: 0,
              width: 600,
              height: 400,
              z: 1,
            },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          settings: { snapGrid: false },
        },
      });
      await host.request('terminal_spawn', {
        id,
        shell: 'powershell',
        cwd: data,
        cols: 80,
        rows: 24,
      });
      await host.request('terminal_write', {
        id,
        data: [
          ...Buffer.from(
            "\x1b[1;1R[Console]::WriteLine('CRASH_PID_' + $PID)\r",
          ),
        ],
      });
      const deadline = Date.now() + 15000;
      let output = '';
      while (!shellPid && Date.now() < deadline) {
        const poll = (await host.request('terminal_poll', {
          id,
          maxBytes: 65536,
        })) as { bytes: number[] };
        output += Buffer.from(poll.bytes).toString('utf8');
        shellPid = Number(/CRASH_PID_(\d+)/.exec(output)?.[1] || 0);
        if (!shellPid) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(shellPid).toBeGreaterThan(0);
      expect(host.pid).toBeGreaterThan(0);
      process.kill(host.pid!);
      await viWait(() => failed.length > 0);
      await host.stop();
      expect(() => process.kill(shellPid, 0)).toThrow();
      expect(() => process.kill(host.pid!, 0)).toThrow();
      const replacement = new NativeHost(program, data, homedir(), () => {});
      try {
        expect(
          await replacement.request('workspace_open', { id: workspaceId }),
        ).toHaveProperty('document.id', workspaceId);
      } finally {
        await replacement.stop();
      }
    } finally {
      await host.stop();
      await rm(data, { recursive: true, force: true });
    }
  },
  30000,
);
async function viWait(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 25));
  expect(predicate()).toBe(true);
}
test.skipIf(process.platform !== 'win32' || !existsSync(program))(
  'closing stops new launches while allowing final durable operations to settle',
  async () => {
    const data = await mkdtemp(join(tmpdir(), 'agentcanvas-closing-test-'));
    const host = new NativeHost(program, data, homedir(), () => {});
    const workspaceId = randomUUID(),
      noteId = randomUUID();
    try {
      await host.request('workspace_create', {
        id: workspaceId,
        name: 'Close flush',
        folder: null,
      });
      const relativePath = await host.request('note_create', {
        workspaceId,
        id: noteId,
      });
      const expected = await host.request('note_read', {
        workspaceId,
        relativePath,
      });
      await host.request('editor_quiesce');
      await host.request('note_save', {
        workspaceId,
        relativePath,
        expected,
        content: 'Final pending edit',
      });
      expect(
        await host.request('note_read', { workspaceId, relativePath }),
      ).toBe('Final pending edit');
      await expect(
        host.request('terminal_spawn', {
          id: randomUUID(),
          shell: 'powershell',
          cwd: data,
          cols: 80,
          rows: 24,
        }),
      ).rejects.toThrow('closing');
    } finally {
      await host.stop();
      await rm(data, { recursive: true, force: true });
    }
  },
  15000,
);
test.skipIf(process.platform !== 'win32' || !existsSync(program))(
  'bundled sidecar preserves workspace and notes, validates IPC, runs ConPTY and kills it on EOF',
  async () => {
    const data = await mkdtemp(join(tmpdir(), 'agentcanvas-editor-test-'));
    const host = new NativeHost(program, data, homedir(), () => {});
    const workspaceId = randomUUID(),
      terminalId = randomUUID(),
      noteId = randomUUID();
    const layout = {
      nodes: [
        {
          id: terminalId,
          kind: 'terminal',
          title: 'Smoke',
          color: '#8b5cf6',
          x: 0,
          y: 0,
          width: 600,
          height: 400,
          z: 1,
          shell: 'powershell',
          cwd: data,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      settings: { snapGrid: false },
      edges: [],
    };
    let shellPid = 0;
    try {
      await host.request('workspace_create', {
        id: workspaceId,
        name: 'Editor smoke',
        folder: null,
      });
      await host.request('workspace_save', { id: workspaceId, layout });
      const path = await host.request('note_create', {
        workspaceId,
        id: noteId,
      });
      expect(typeof path).toBe('string');
      const original = await host.request('note_read', {
        workspaceId,
        relativePath: path,
      });
      await host.request('note_save', {
        workspaceId,
        relativePath: path,
        expected: original,
        content: 'Editor note 🌍',
      });
      expect(
        await host.request('note_read', { workspaceId, relativePath: path }),
      ).toBe('Editor note 🌍');
      await expect(
        host.request('note_read', { workspaceId, relativePath: '../secrets' }),
      ).rejects.toThrow();
      await expect(
        host.request('terminal_spawn', {
          id: terminalId,
          shell: 'powershell',
          cwd: data,
          cols: 0,
          rows: 24,
        }),
      ).rejects.toThrow();
      await expect(
        host.request('workspace_list', { unexpected: true }),
      ).rejects.toThrow();
      await host.request('collaboration_sync', { workspaceId, layout });
      expect(
        await host.request('task_snapshot', { workspaceId }),
      ).toHaveProperty('board');
      expect(
        await host.request('team_snapshot', { workspaceId }),
      ).toHaveProperty('snapshot');
      await host.request('terminal_spawn', {
        id: terminalId,
        shell: 'powershell',
        cwd: data,
        cols: 100,
        rows: 30,
      });
      await host.request('terminal_write', {
        id: terminalId,
        data: [
          ...Buffer.from(
            "\x1b[1;1R[Console]::WriteLine('CANVAS_PID_' + $PID)\r",
          ),
        ],
      });
      let output = '';
      const deadline = Date.now() + 15000;
      while (!shellPid && Date.now() < deadline) {
        const poll = (await host.request('terminal_poll', {
          id: terminalId,
          maxBytes: 65536,
        })) as { bytes: number[] };
        output += Buffer.from(poll.bytes).toString('utf8');
        const match = /CANVAS_PID_(\d+)/.exec(output);
        if (match) shellPid = Number(match[1]);
        else await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(shellPid).toBeGreaterThan(0);
      await host.request('terminal_resize', {
        id: terminalId,
        cols: 120,
        rows: 40,
      });
      await host.stop();
      expect(() => process.kill(shellPid, 0)).toThrow();
      const saved = await readFile(
        join(data, 'workspaces', workspaceId, 'workspace.json'),
        'utf8',
      );
      expect(saved).not.toContain('CANVAS_PID_');
      expect(saved).not.toContain('AGENTCANVAS_TOKEN');
      const second = new NativeHost(program, data, homedir(), () => {});
      try {
        const reopened = (await second.request('workspace_open', {
          id: workspaceId,
        })) as { document: { nodes: unknown[] } };
        expect(reopened.document.nodes).toEqual(layout.nodes);
        expect(
          await second.request('note_read', {
            workspaceId,
            relativePath: path,
          }),
        ).toBe('Editor note 🌍');
      } finally {
        await second.stop();
      }
    } finally {
      await host.stop();
      await rm(data, { recursive: true, force: true });
    }
  },
  30000,
);
