import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  opendir,
  lstat,
  realpath,
  rename,
} from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { frame, record } from './protocol';
type RecoveryLayout = {
  nodes: (Record<string, unknown> & {
    id: string;
    kind: string;
    title: string;
    relativePath?: string;
    cwd?: string;
  })[];
  edges: Record<string, unknown>[];
  viewport: Record<string, unknown>;
  settings: Record<string, unknown>;
};

const MAX_BYTES = 64 * 1024 * 1024;
const uuid =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const idPattern = new RegExp(`^${uuid}$`);
const filePattern = new RegExp(`^drafts-${uuid}\\.json$`);
const notePattern = new RegExp(`^notes/${uuid}\\.md$`);
export type RecoverySave =
  | { command: 'workspace_save'; args: { id: string; layout: RecoveryLayout } }
  | {
      command: 'note_save';
      args: {
        workspaceId: string;
        relativePath: string;
        expected: string;
        content: string;
      };
    };
export type RecoveryFile = { id: string; modified: number; bytes: number };
export type RecoveryDraft = {
  id: string;
  fingerprint: string;
  saves: RecoverySave[];
};
export type RecoveryResult = {
  workspaceId: string;
  folder: string;
  name: string;
};
export type RecoveryPort = {
  request: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown>;
};

function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !value.includes('\0') &&
    Buffer.byteLength(value) <= 512 * 1024
  );
}
function parse(value: unknown): RecoverySave[] {
  if (
    !record(value) ||
    value.version !== 1 ||
    !keys(value, ['version', 'saves']) ||
    !Array.isArray(value.saves) ||
    value.saves.length > 501
  )
    throw new Error('Unsupported recovery file. The original has been kept.');
  const seen = new Set<string>();
  return value.saves.map((save: unknown) => {
    if (!record(save) || !keys(save, ['command', 'args']) || !record(save.args))
      throw new Error('Invalid recovery draft.');
    const a = save.args;
    let key: string;
    if (save.command === 'workspace_save') {
      if (
        !keys(a, ['id', 'layout']) ||
        typeof a.id !== 'string' ||
        !idPattern.test(a.id) ||
        !record(a.layout) ||
        !keys(a.layout, ['nodes', 'viewport', 'settings', 'edges']) ||
        !Array.isArray(a.layout.nodes) ||
        a.layout.nodes.length > 500 ||
        !a.layout.nodes.every(
          (node: unknown) =>
            record(node) &&
            typeof node.id === 'string' &&
            idPattern.test(node.id) &&
            typeof node.title === 'string' &&
            typeof node.kind === 'string',
        ) ||
        !Array.isArray(a.layout.edges) ||
        !a.layout.edges.every(record) ||
        !record(a.layout.viewport) ||
        !record(a.layout.settings)
      )
        throw new Error('Invalid layout draft.');
      key = `layout:${a.id}`;
    } else if (save.command === 'note_save') {
      if (
        !keys(a, ['workspaceId', 'relativePath', 'expected', 'content']) ||
        typeof a.workspaceId !== 'string' ||
        !idPattern.test(a.workspaceId) ||
        typeof a.relativePath !== 'string' ||
        !notePattern.test(a.relativePath) ||
        !text(a.expected) ||
        !text(a.content)
      )
        throw new Error('Invalid note draft.');
      key = `note:${a.workspaceId}:${a.relativePath}`;
    } else
      throw new Error(
        'Recovery files can contain only layout and note drafts.',
      );
    frame(save);
    if (seen.has(key)) throw new Error('Duplicate recovery draft.');
    seen.add(key);
    return save as RecoverySave;
  });
}
export function workspaceSaves(draft: RecoveryDraft, workspaceId: string) {
  const saves = draft.saves.filter(
    (save) =>
      (save.command === 'workspace_save'
        ? save.args.id
        : save.args.workspaceId) === workspaceId,
  );
  if (!saves.length)
    throw new Error('Choose a workspace from this recovery file.');
  return saves;
}

/** Only application-owned recovery files are accepted; originals are immutable. */
export class RecoveryStore {
  private restoring = false;
  constructor(private storage: string) {}
  private async folder(create = false) {
    const folder = join(this.storage, 'recovery');
    if (create) await mkdir(folder, { recursive: true });
    const info = await lstat(folder);
    const root = await realpath(this.storage);
    const resolved = await realpath(folder);
    const child = relative(root, resolved);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      !child ||
      child.startsWith('..') ||
      isAbsolute(child)
    )
      throw new Error(
        'Recovery folder must be inside extension storage without links.',
      );
    return resolved;
  }
  private async readFile(name: string, limit = MAX_BYTES) {
    const path = join(await this.folder(), name);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
      throw new Error('Recovery files must be regular files without links.');
    const file = await open(path, 'r');
    try {
      const size = (await file.stat()).size;
      if (size > limit)
        throw new Error('Recovery file exceeds its size limit.');
      const bytes = Buffer.alloc(size + 1);
      let length = 0;
      while (length < bytes.length) {
        const read = await file.read(
          bytes,
          length,
          bytes.length - length,
          null,
        );
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      if (length > size)
        throw new Error('Recovery file changed while reading.');
      return bytes.subarray(0, length);
    } finally {
      await file.close();
    }
  }
  private async writeFile(name: string, value: unknown) {
    const path = join(await this.folder(true), name);
    const temporary = `${path}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(value), 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    return path;
  }
  async preserve(saves: unknown) {
    const value = { version: 1, saves };
    parse(value);
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES)
      throw new Error('Recovery drafts exceed 64 MiB.');
    return this.writeFile(`drafts-${randomUUID()}.json`, value);
  }
  async list(): Promise<RecoveryFile[]> {
    let folder: string;
    try {
      folder = await this.folder();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const entries: RecoveryFile[] = [];
    for await (const entry of await opendir(folder)) {
      if (!filePattern.test(entry.name)) continue;
      if (entries.length >= 2000)
        throw new Error(
          'Recovery folder contains more than 2,000 files. Preserve older files outside this folder before continuing.',
        );
      const info = await lstat(join(folder, entry.name));
      entries.push({
        id: entry.name,
        modified: info.mtimeMs,
        bytes: info.size,
      });
    }
    return entries.sort((a, b) => b.modified - a.modified);
  }
  async inspect(id: string): Promise<RecoveryDraft> {
    if (!filePattern.test(id))
      throw new Error('Invalid recovery file identifier.');
    const bytes = await this.readFile(id);
    return {
      id,
      fingerprint: createHash('sha256').update(bytes).digest('hex'),
      saves: parse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      ),
    };
  }
  async restore(
    draft: RecoveryDraft,
    workspaceId: string,
    port: RecoveryPort,
    notesOnly = false,
  ): Promise<RecoveryResult> {
    if (this.restoring)
      throw new Error('A recovery copy is already being saved.');
    this.restoring = true;
    let destination: RecoveryResult | undefined;
    try {
      const current = await this.inspect(draft.id);
      if (current.fingerprint !== draft.fingerprint)
        throw new Error(
          'Recovery file changed. Inspect it again before restoring.',
        );
      const saves = workspaceSaves(current, workspaceId).filter(
        (save) => !notesOnly || save.command === 'note_save',
      );
      if (!saves.length)
        throw new Error('This workspace has no pending note drafts.');
      const receipt = `copy-${notesOnly ? 'notes-' : ''}${current.fingerprint}-${workspaceId}.json`;
      try {
        const saved = JSON.parse(
          (await this.readFile(receipt, 4096)).toString('utf8'),
        );
        if (
          !record(saved) ||
          typeof saved.workspaceId !== 'string' ||
          !idPattern.test(saved.workspaceId) ||
          typeof saved.folder !== 'string' ||
          typeof saved.name !== 'string'
        )
          throw new Error('Invalid recovery-copy receipt.');
        return saved as RecoveryResult;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const layout: RecoveryLayout = structuredClone(
        saves.find((save) => save.command === 'workspace_save')?.args
          .layout ?? {
          nodes: [],
          edges: [],
          viewport: { x: 72, y: 72, zoom: 1 },
          settings: { snapGrid: false },
        },
      );
      const contents = new Map(
        saves
          .filter((save) => save.command === 'note_save')
          .map((save) => [save.args.relativePath, save.args.content]),
      );
      const missing = layout.nodes.filter(
        (node) => node.kind === 'note' && !contents.has(node.relativePath!),
      );
      let contentBytes = [...contents.values()].reduce(
        (bytes, content) => bytes + Buffer.byteLength(content),
        0,
      );
      if (missing.length) {
        await port.request('workspace_open', { id: workspaceId });
        try {
          for (const node of missing) {
            const content = await port.request('note_read', {
              workspaceId,
              relativePath: node.relativePath,
            });
            if (!text(content)) throw new Error('Invalid source note.');
            contentBytes +=
              Buffer.byteLength(content) -
              Buffer.byteLength(contents.get(node.relativePath!) ?? '');
            if (contentBytes > MAX_BYTES)
              throw new Error('Recovered notes exceed 64 MiB.');
            contents.set(node.relativePath!, content);
          }
        } finally {
          await port.request('workspace_release', { id: workspaceId });
        }
      }
      for (const node of layout.nodes) delete node.areaId;
      for (const edge of layout.edges) edge.policy = 'approval';
      for (const [relativePath] of contents) {
        if (
          layout.nodes.some(
            (node) =>
              node.kind === 'note' && node.relativePath === relativePath,
          )
        )
          continue;
        layout.nodes.push({
          id: randomUUID(),
          kind: 'note',
          title: 'Recovered note',
          relativePath,
          color: '#8b5cf6',
          x: 72 + layout.nodes.length * 24,
          y: 72,
          width: 420,
          height: 300,
          z: layout.nodes.length,
        });
      }
      // Validate the complete copy with Rust before creating any workspace files.
      const validated = await port.request('editor_validate_layout', {
        layout,
      });
      const id = randomUUID();
      const loaded = (await port.request('workspace_create', {
        id,
        name: `Recovered drafts ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
        folder: null,
      })) as { folder: string; document: { name: string } };
      destination = {
        workspaceId: id,
        folder: loaded.folder,
        name: loaded.document.name,
      };
      try {
        for (const [relativePath, content] of contents) {
          await port.request('note_create', {
            workspaceId: id,
            id: relativePath.slice(6, -3),
          });
          const expected = await port.request('note_read', {
            workspaceId: id,
            relativePath,
          });
          await port.request('note_save', {
            workspaceId: id,
            relativePath,
            expected,
            content,
          });
        }
        await port.request('workspace_save', { id, layout: validated });
        await this.writeFile(receipt, destination);
      } finally {
        await port.request('workspace_release', { id });
      }
      return destination;
    } catch (error) {
      throw new Error(
        `${String(error)}${destination ? ` A partial copy remains at ${destination.folder}.` : ''} Original workspaces and recovery drafts were kept. If saved notes are locked, close their canvas tab before retrying.`,
        { cause: error },
      );
    } finally {
      this.restoring = false;
    }
  }
}
