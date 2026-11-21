import { expect, test, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Backend } from './backend';
import { NativeHost } from './host';
import { RecoveryStore } from './recovery';

const program = resolve(
  process.env.AGENTCANVAS_EDITOR_TEST_BINARY ||
    'extension/native/agentcanvas-editor.exe',
);
test.skipIf(process.platform !== 'win32' || !existsSync(program))(
  'native crash/restart restores drafts, reconciles an uncertain save, and preserves a later external conflict',
  async () => {
    const data = await mkdtemp(join(tmpdir(), 'agentcanvas-restart-test-'));
    const recovery = new RecoveryStore(data),
      reload = vi.fn(),
      commands: string[] = [];
    let loseReply = false;
    const backend = new Backend({
      trusted: () => true,
      capture: async () => {},
      changed: () => {},
      reload,
      preserve: (saves) => recovery.preserve(saves),
      create: (failed) => {
        const host = new NativeHost(program, data, homedir(), () => {}, failed);
        return {
          pid: host.pid,
          stop: () => host.stop(),
          request: async (command, args) => {
            commands.push(command);
            const value = await host.request(command, args);
            if (loseReply && command === 'note_save') {
              loseReply = false;
              throw new Error('Simulated lost successful save reply');
            }
            return value;
          },
        };
      },
    });
    const id = randomUUID(),
      noteId = randomUUID();
    try {
      await backend.start();
      const loaded = (await backend.request('workspace_create', {
        id,
        name: 'Restart fixture',
        folder: null,
      })) as { folder: string };
      const relativePath = (await backend.request('note_create', {
        workspaceId: id,
        id: noteId,
      })) as string;
      const expected = await backend.request('note_read', {
        workspaceId: id,
        relativePath,
      });
      const layout = {
        nodes: [
          {
            id: noteId,
            kind: 'note',
            title: 'Draft',
            color: '#708f7c',
            x: 0,
            y: 0,
            width: 420,
            height: 300,
            z: 1,
            relativePath,
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        settings: { snapGrid: false },
      };
      await backend.request('workspace_save', { id, layout });
      await backend.request('workspace_activate', { id });
      const note = {
        workspaceId: id,
        relativePath,
        expected,
        content: 'Latest draft 世界',
      };
      backend.checkpoint('note_save', note);
      backend.checkpoint('workspace_save', {
        id,
        layout: { ...layout, viewport: { x: 144, y: -72, zoom: 0.75 } },
      });
      loseReply = true;
      await expect(backend.request('note_save', note)).rejects.toThrow(
        'lost successful',
      );
      const oldPid = backend.pid!;
      process.kill(oldPid);
      await vi.waitFor(() => expect(backend.state.phase).toBe('failed'));
      await backend.restart();
      expect(() => process.kill(oldPid, 0)).toThrow();
      expect(backend.pid).not.toBe(oldPid);
      expect(backend.checkpoints.snapshot()).toEqual([]);
      expect(reload).toHaveBeenCalledExactlyOnceWith(2);
      const saved = JSON.parse(
        await readFile(join(loaded.folder, 'workspace.json'), 'utf8'),
      );
      expect(saved.viewport).toEqual({ x: 144, y: -72, zoom: 0.75 });
      expect(await readFile(join(loaded.folder, relativePath), 'utf8')).toBe(
        note.content,
      );
      expect(
        (await recovery.inspect(basename(backend.state.recoveryPath!))).saves,
      ).toHaveLength(2);
      expect(commands).not.toContain('terminal_spawn');
      expect(commands).not.toContain('team_control');
      backend.checkpoint('note_save', {
        ...note,
        content: 'Retained second draft',
      });
      await writeFile(
        join(loaded.folder, relativePath),
        'External change',
        'utf8',
      );
      await expect(backend.restart()).rejects.toThrow();
      expect(backend.state.phase).toBe('failed');
      expect(backend.checkpoints.snapshot()).toHaveLength(1);
      expect(await readFile(join(loaded.folder, relativePath), 'utf8')).toBe(
        'External change',
      );
      const preserved = await recovery.inspect(
        basename(backend.state.recoveryPath!),
      );
      expect(preserved.saves[0].args).toHaveProperty(
        'content',
        'Retained second draft',
      );
    } finally {
      await backend.stop();
      await rm(data, { recursive: true, force: true });
    }
  },
  30000,
);
