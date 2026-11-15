import type { CanvasNode } from '../canvas/model';

const paths = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sidebar:
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 3v18',
  inspector:
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM15 3v18',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 15l6 6',
  chev: 'M6 9l6 6 6-6',
  terminal:
    'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM7 9l3 3-3 3M13 15h4',
  note: 'M4 3h16v13l-5 5H4ZM15 21v-5h5M8 8h8M8 12h6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6',
  select: 'M4 3l7 18 3-7 7-3Z',
  draw: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  link: 'M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7',
  branch:
    'M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM6 7v10M18 7v3a5 5 0 0 1-5 5H6',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 5v6h-6',
  folder:
    'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z',
  phone: 'M8 3h8v18H8zM11 18h2',
  browser:
    'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  cli: 'M4 5h16v14H4zM8 10l3 2-3 2',
  pause: 'M6 4h4v16H6ZM14 4h4v16h-4Z',
  play: 'M8 5l11 7-11 7z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  canvas: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  agent:
    'M12 3v4M10 3h4M6 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM2 11v5M22 11v5M9 12h.01M15 12h.01M9 17h6',
  review:
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5M14 2v6h6v3M20 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM19 19l3 3',
  settings:
    'M10 2h4l1 3 2 1 3-.5 2 3.5-2 2v2l2 2-2 3.5-3-.5-2 1-1 3h-4l-1-3-2-1-3 .5-2-3.5 2-2v-2l-2-2L4 5.5 7 6l2-1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  team: 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 3a4 4 0 0 1 0 8M22 21v-2a5 5 0 0 0-4-4.9',
  activity: 'M2 12h5l3-8 4 16 3-8h5',
  tasks:
    'M9 3H5a1 1 0 0 0-1 1v17h16V4a1 1 0 0 0-1-1h-4M9 2h6v4H9ZM8 11l1 1 2-2M14 11h3M8 17l1 1 2-2M14 17h3',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  card: 'M4 5h16v14H4z',
  shapes: 'M3 3h8v8H3ZM21 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21l4-7 4 7Z',
  rectangle: 'M3 5h18v14H3Z',
  ellipse: 'M21 12a9 7 0 1 1-18 0 9 7 0 0 1 18 0Z',
  text: 'M4 4h16M12 4v16M8 20h8',
  arrow: 'M5 19 19 5M5 5h14v14',
  connector: 'M7 5H3v4h4ZM21 15h-4v4h4ZM7 7h5v10h5',
  freehand: 'M3 17c3-10 5-13 7-12s-6 14-3 15 6-12 8-12-2 10 1 10c2 0 3-3 5-3',
  fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8h8v8H8Z',
  grid: 'M4 4h16v16H4ZM4 12h16M12 4v16',
  back: 'M19 12H5M12 5l-7 7 7 7',
  forward: 'M5 12h14M12 5l7 7-7 7',
  keyboard:
    'M3 5h18v14H3ZM7 9h.01M11 9h.01M15 9h.01M18 9h.01M7 13h.01M11 13h.01M15 13h.01M18 13h.01M8 16h8',
  chat: 'M4 5h16v11H9l-5 4z',
  close: 'M6 6l12 12M18 6L6 18',
  command:
    'M18 8a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V5a3 3 0 1 0-3 3Z',
  undo: 'M9 5l-5 5 5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'M15 5l5 5-5 5M20 10H10a6 6 0 0 0 0 12',
};

export type IconName = keyof typeof paths;
export function nodeIcon(
  node: Pick<CanvasNode, 'kind' | 'agent' | 'shape'>,
): IconName {
  if (node.kind === 'terminal' && node.agent) return 'agent';
  if (node.kind === 'shape') return node.shape?.kind ?? 'shapes';
  return node.kind;
}
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
