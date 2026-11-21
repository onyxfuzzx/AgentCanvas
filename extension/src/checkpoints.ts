import { frame, record } from './protocol';

type Save = {
  command: 'workspace_save' | 'note_save';
  args: Record<string, unknown>;
};
/** At most one current layout per workspace and one draft per note; no process data. */
export class Checkpoints {
  private saves = new Map<string, Save>();
  private bytes = 0;
  private baselines = new Map<string, unknown>();
  private key(command: string, args: Record<string, unknown>) {
    return command === 'workspace_save'
      ? JSON.stringify([command, args.id])
      : JSON.stringify([command, args.workspaceId, args.relativePath]);
  }
  update(command: unknown, args: unknown) {
    if (
      (command !== 'workspace_save' && command !== 'note_save') ||
      !record(args)
    )
      throw new Error('Invalid durable checkpoint.');
    if (command === 'workspace_save') {
      if (typeof args.id !== 'string' || !record(args.layout))
        throw new Error('Invalid layout checkpoint.');
    } else if (
      typeof args.workspaceId !== 'string' ||
      typeof args.relativePath !== 'string' ||
      typeof args.expected !== 'string' ||
      typeof args.content !== 'string'
    )
      throw new Error('Invalid note checkpoint.');
    const key = this.key(command, args);
    const save: Save = { command, args: structuredClone(args) };
    const old = this.saves.get(key);
    if (command === 'note_save' && this.baselines.has(key))
      save.args.expected = this.baselines.get(key);
    const size = Buffer.byteLength(frame(save));
    const total = this.bytes + size - (old ? Buffer.byteLength(frame(old)) : 0);
    if ((this.saves.size >= 501 && !old) || total > 64 * 1024 * 1024)
      throw new Error(
        'Pending save checkpoint limit reached. Save the canvas before editing more.',
      );
    this.saves.set(key, save);
    this.bytes = total;
  }
  saved(command: string, args: Record<string, unknown>) {
    const key = this.key(command, args);
    if (command === 'note_save') this.baseline(args, args.content);
    const current = this.saves.get(key);
    if (!current) return;
    this.bytes -= Buffer.byteLength(frame(current));
    if (command === 'note_save' && current.args.content !== args.content) {
      current.args.expected = args.content;
      this.bytes += Buffer.byteLength(frame(current));
    } else if (
      command === 'workspace_save' &&
      JSON.stringify(current.args.layout) !== JSON.stringify(args.layout)
    ) {
      this.bytes += Buffer.byteLength(frame(current));
    } else this.saves.delete(key);
  }
  snapshot() {
    return structuredClone([...this.saves.values()]);
  }
  baseline(args: Record<string, unknown>, content: unknown) {
    const key = this.key('note_save', args);
    if (this.baselines.size >= 500 && !this.baselines.has(key)) {
      const unused = [...this.baselines.keys()].find(
        (candidate) => !this.saves.has(candidate),
      );
      if (unused) this.baselines.delete(unused);
    }
    this.baselines.set(key, content);
  }
  async flush(
    request: (
      command: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>,
  ) {
    const saves = this.snapshot().sort(
      (a, b) =>
        Number(a.command === 'workspace_save') -
        Number(b.command === 'workspace_save'),
    );
    for (const save of saves) {
      await request(save.command, save.args);
      this.saved(save.command, save.args);
    }
  }
}
