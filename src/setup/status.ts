export type SetupStatus = { version: 1; completed: boolean };
export const setupStatus = (value: unknown): SetupStatus => ({
  version: 1,
  completed: Boolean(
    value &&
    typeof value === 'object' &&
    'version' in value &&
    value.version === 1 &&
    'completed' in value &&
    value.completed === true,
  ),
});
