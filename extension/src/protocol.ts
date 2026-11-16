export const MAX_FRAME = 8 * 1024 * 1024;
export const MAX_PENDING = 64;
export const nativeCommands = new Set([
  'editor_quiesce',
  'shells',
  'agent_providers',
  'agent_inspect',
  'agent_catalog',
  'agent_catalog_save',
  'terminal_spawn',
  'terminal_write',
  'terminal_resize',
  'terminal_poll',
  'terminal_close',
  'workspace_list',
  'workspace_create',
  'workspace_open',
  'workspace_open_folder',
  'workspace_save',
  'workspace_release',
  'workspace_activate',
  'note_create',
  'note_read',
  'note_save',
  'collaboration_sync',
  'collaboration_snapshot',
  'collaboration_decide',
  'task_snapshot',
  'task_action',
  'team_snapshot',
  'team_pause_workspace',
  'team_control',
  'team_emergency_stop',
  'team_launch',
  'team_check_run',
  'area_catalog',
  'area_review',
  'area_file',
  'area_file_location',
  'area_preview',
  'area_action',
]);
export function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function frame(value: unknown) {
  const data = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(data) > MAX_FRAME)
    throw new Error('Editor frame exceeds 8 MiB.');
  return data;
}
export function validId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
export function externalUrl(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error('Invalid browser address.');
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname
  )
    throw new Error('Use an HTTP or HTTPS address without credentials.');
  return url.toString();
}

/** Preserve UTF-8 across arbitrary pipe chunks and reject oversized replies. */
export class Frames {
  private parts: Buffer[] = [];
  private size = 0;
  constructor(private receive: (value: unknown) => void) {}
  push(chunk: Buffer) {
    let offset = 0;
    while (offset < chunk.length) {
      const end = chunk.indexOf(10, offset);
      const part = chunk.subarray(offset, end < 0 ? chunk.length : end + 1);
      this.size += part.length;
      if (this.size > MAX_FRAME) throw new Error('Editor reply exceeds 8 MiB.');
      this.parts.push(part);
      if (end >= 0) {
        const line = Buffer.concat(this.parts, this.size).toString('utf8');
        this.parts = [];
        this.size = 0;
        this.receive(JSON.parse(line));
      }
      offset += part.length;
    }
  }
}
