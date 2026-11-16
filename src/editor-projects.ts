export type EditorProjectFolder = { name: string; path: string };
export type EditorProjectContext = {
  folders: EditorProjectFolder[];
  defaultCwd: string;
};
