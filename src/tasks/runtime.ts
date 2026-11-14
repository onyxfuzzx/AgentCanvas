import { invoke } from '../native';
import type { Transport } from '../terminal/session';

/** Normal workspace switch/close must await explicit task mutations already sent. */
export class TaskMutations {
  private pending = new Set<Promise<unknown>>();
  constructor(
    private transport: Transport,
    private command = 'task_action',
  ) {}
  run<T>(args: Record<string, unknown>): Promise<T> {
    const operation = this.transport<T>(this.command, args);
    this.pending.add(operation);
    return operation.finally(() => this.pending.delete(operation));
  }
  async flush() {
    await Promise.all([...this.pending]);
  }
}
export const taskMutations = new TaskMutations(invoke);
