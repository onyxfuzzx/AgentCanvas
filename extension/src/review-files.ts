import { isAbsolute } from 'node:path';
import { record } from './protocol';
export type ReviewFilePorts = {
  request: (command: string, args: Record<string, unknown>) => Promise<unknown>;
  open: (path: string, line: number) => Promise<void>;
};
/** Only a native-validated managed checkout can supply an editor file URI. */
export async function openReviewedFile(args: unknown, ports: ReviewFilePorts) {
  if (
    !record(args) ||
    Object.keys(args).some(
      (key) => !['workspaceId', 'id', 'relative', 'line'].includes(key),
    ) ||
    typeof args.workspaceId !== 'string' ||
    typeof args.id !== 'string' ||
    typeof args.relative !== 'string' ||
    (args.line !== undefined &&
      (!Number.isSafeInteger(args.line) ||
        Number(args.line) < 1 ||
        Number(args.line) > 1_000_000))
  )
    throw new Error('Choose a file from a task-area review.');
  const path = await ports.request('area_file_location', {
    workspaceId: args.workspaceId,
    id: args.id,
    relative: args.relative,
  });
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))
    throw new Error('The backend returned an invalid reviewed file path.');
  await ports.open(path, Number(args.line ?? 1));
}
