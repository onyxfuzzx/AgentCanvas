import { isAbsolute } from 'node:path';
import type {
  EditorProjectContext,
  EditorProjectFolder,
} from '../../src/editor-projects';

export type ProjectPorts = {
  folders: () => EditorProjectFolder[];
  activeFolder: () => string | undefined;
  pickDirectory: (initial: string | undefined) => Promise<string | null>;
};
/** Project selection is editor-window state, separate from saved terminal cwd. */
export class EditorProjects {
  private selected?: string;
  private active?: string;
  constructor(private ports: ProjectPorts) {}
  captureActiveFolder() {
    this.active = this.ports.activeFolder() ?? this.active;
  }
  context(): EditorProjectContext {
    const folders = this.ports.folders();
    const preferred =
      folders.find((folder) => folder.path === this.selected) ??
      folders.find((folder) => folder.path === this.ports.activeFolder()) ??
      folders.find((folder) => folder.path === this.active) ??
      folders[0];
    return { folders, defaultCwd: preferred?.path ?? '' };
  }
  select(path: unknown): EditorProjectContext {
    if (
      typeof path !== 'string' ||
      !this.ports.folders().some((folder) => folder.path === path)
    )
      throw new Error('Choose a folder that is currently open in this editor.');
    this.selected = path;
    return this.context();
  }
  async browse(cwd: unknown): Promise<string | null> {
    if (typeof cwd !== 'string' || cwd.length > 32768 || cwd.includes('\0'))
      throw new Error('Invalid working directory.');
    const initial = cwd && isAbsolute(cwd) ? cwd : this.context().defaultCwd;
    return this.ports.pickDirectory(initial || undefined);
  }
}
