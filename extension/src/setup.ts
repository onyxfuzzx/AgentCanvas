import { setupStatus } from '../../src/setup/status';
export const setupPreferenceKey = 'setup.v1';
export class SetupPreferences {
  constructor(
    private storage: {
      get: (key: string) => unknown;
      update: (key: string, value: unknown) => PromiseLike<void>;
    },
  ) {}
  get() {
    return setupStatus(this.storage.get(setupPreferenceKey));
  }
  async complete() {
    await this.storage.update(setupPreferenceKey, {
      version: 1,
      completed: true,
    });
    return this.get();
  }
}
