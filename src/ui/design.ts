import type { IconName } from './Icon';
export const views = [
  ['canvas', 'Canvas', 'canvas'],
  ['tasks', 'Tasks', 'tasks'],
  ['team', 'Team run', 'team'],
  ['areas', 'Task areas', 'branch'],
  ['review', 'Review', 'review'],
  ['notes', 'Notes', 'note'],
  ['activity', 'Activity', 'activity'],
  ['settings', 'Settings', 'settings'],
] as const satisfies readonly (readonly [string, string, IconName])[];
export type View = (typeof views)[number][0];
export const descriptions: Record<Exclude<View, 'canvas'>, string> = {
  tasks: 'A clear path from a brief to an accepted result.',
  team: 'A small team, working toward one shared goal.',
  areas: 'Separate checkouts. Clear ownership.',
  review: 'Evidence first. Integration when you are ready.',
  notes: 'A little context goes a long way.',
  activity: 'The decisions and progress that matter.',
  settings: 'Make this workspace feel like yours.',
};
export type Appearance = {
  grid: boolean;
  motion: boolean;
  accent: string;
  shell: 'powershell' | 'cmd' | 'wsl' | 'git-bash';
};
export function readAppearance(): Appearance {
  const defaults: Appearance = {
    grid: true,
    motion: true,
    accent: '',
    shell: 'powershell',
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem('agentcanvas.appearance') || '{}',
    );
    return {
      grid: typeof saved.grid === 'boolean' ? saved.grid : true,
      motion: typeof saved.motion === 'boolean' ? saved.motion : true,
      accent: /^#[0-9a-f]{6}$/i.test(saved.accent) ? saved.accent : '',
      shell: ['powershell', 'cmd', 'wsl', 'git-bash'].includes(saved.shell)
        ? saved.shell
        : 'powershell',
    };
  } catch {
    return defaults;
  }
}
