const paths = {
  plus: 'M12 5v14M5 12h14',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  chev: 'M6 9l6 6 6-6',
  terminal: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
  note: 'M6 3h9l4 4v14H6zM9 12h7M9 16h5',
  select: 'M6 4l12 7-5 1.5L11 18z',
  draw: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  link: 'M7 4v10M7 18a2 2 0 100 .01M17 8a2 2 0 100 .01M17 10c0 4-10 2-10 5',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 5v6h-6',
  folder: 'M3 7h6l2 2h10v10H3z',
  phone: 'M8 3h8v18H8zM11 18h2',
  browser:
    'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  cli: 'M4 5h16v14H4zM8 10l3 2-3 2',
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5l11 7-11 7z',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 3v2M12 19v2M3 12h2M19 12h2',
  canvas: 'M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14',
  agent: 'M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z',
  review: 'M5 12l5 5 9-10',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 3v3M12 18v3M3 12h3M18 12h3',
  team: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 19c0-3 3-5 6-5s6 2 6 5M17 8a2.5 2.5 0 010 5',
  activity: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  tasks: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  card: 'M4 5h16v14H4z',
  chat: 'M4 5h16v11H9l-5 4z',
  close: 'M6 6l12 12M18 6L6 18',
  command:
    'M8 8h8v8H8zM8 8a2 2 0 10-2-2M16 8a2 2 0 112-2M8 16a2 2 0 11-2 2M16 16a2 2 0 102 2',
  undo: 'M9 5l-5 5 5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'M15 5l5 5-5 5M20 10H10a6 6 0 0 0 0 12',
};

export type IconName = keyof typeof paths;
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
    >
      <path d={paths[name]} />
    </svg>
  );
}
