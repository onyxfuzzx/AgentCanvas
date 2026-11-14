import { invoke } from '../native';
export class TeamOperations {
  private pending = new Set<Promise<unknown>>();
  track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation);
    return operation.finally(() => this.pending.delete(operation));
  }
  invoke<T>(command: string, args: Record<string, unknown>) {
    return this.track(invoke<T>(command, args));
  }
  async flush() {
    await Promise.all([...this.pending]);
  }
}
export const teamOperations = new TeamOperations();
