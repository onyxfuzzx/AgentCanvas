/** Managed areas stay pinned; editor projects supply the default for unscoped launches. */
export function launchDirectory(
  editor: boolean,
  area?: string,
  workspace?: string,
) {
  return area || (editor ? undefined : workspace);
}
