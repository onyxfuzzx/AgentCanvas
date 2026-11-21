document.documentElement.classList.add('js');
const productName = document.querySelector(
  'meta[name="application-name"]',
).content;
const scene = document.querySelector('.canvas-scene');
const viewport = document.querySelector('.canvas-viewport');
const windows = [...document.querySelectorAll('[data-node]')];
const stages = {
  plan: {
    label: 'PLAN',
    text: 'Put the brief and acceptance criteria where every agent can find them.',
    active: ['brief'],
  },
  build: {
    label: 'BUILD',
    text: 'Start the right CLI in its own checkout. Keep changes separate while the work runs.',
    active: ['codex', 'claude'],
  },
  review: {
    label: 'REVIEW',
    text: 'Inspect the diff and the evidence. Acceptance and integration stay in your hands.',
    active: ['antigravity'],
  },
};
let z = 2;
const initial = new Map(
  windows.map((card) => [
    card,
    { x: Number(card.dataset.x), y: Number(card.dataset.y) },
  ]),
);
const positions = new Map(
  [...initial].map(([card, point]) => [card, { ...point }]),
);
function updateConnections() {
  const from = positions.get(document.querySelector('[data-node="brief"]'));
  if (!from) return;
  const x1 = from.x + 134,
    y1 = from.y + 170;
  for (const name of ['codex', 'antigravity', 'claude']) {
    const card = document.querySelector(`[data-node="${name}"]`),
      to = positions.get(card);
    const x2 = to.x + card.offsetWidth / 2,
      y2 = to.y + 16;
    document
      .querySelector(`[data-connection="${name}"]`)
      .setAttribute(
        'd',
        `M${x1} ${y1} C${x1} ${y1 + 80} ${x2} ${y2 - 65} ${x2} ${y2}`,
      );
  }
  const point = document.querySelector('.connections circle');
  point.setAttribute('cx', x1);
  point.setAttribute('cy', y1);
}
function place(card, x, y) {
  positions.set(card, {
    x: Math.max(4, Math.min(1080 - card.offsetWidth - 5, x)),
    y: Math.max(7, Math.min(scene.offsetHeight - card.offsetHeight - 5, y)),
  });
  const point = positions.get(card);
  card.style.left = `${point.x}px`;
  card.style.top = `${point.y}px`;
  updateConnections();
}
for (const card of windows) {
  const handle = card.querySelector('.drag-handle');
  let drag;
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || matchMedia('(max-width: 560px)').matches) return;
    const scale = scene.getBoundingClientRect().width / scene.offsetWidth;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: { ...positions.get(card) },
      scale,
    };
    card.style.zIndex = String(++z);
    card.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    place(
      card,
      drag.start.x + (event.clientX - drag.x) / drag.scale,
      drag.start.y + (event.clientY - drag.y) / drag.scale,
    );
  });
  const endDrag = () => {
    drag = undefined;
    card.classList.remove('is-dragging');
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('lostpointercapture', endDrag);
  handle.addEventListener('keydown', (event) => {
    if (matchMedia('(max-width: 560px)').matches) return;
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 20 : 6,
      point = positions.get(card);
    card.style.zIndex = String(++z);
    place(card, point.x + direction[0] * step, point.y + direction[1] * step);
  });
}
document.querySelector('.reset-layout').addEventListener('click', () => {
  for (const [card, point] of initial) {
    card.style.zIndex = '';
    place(card, point.x, point.y);
  }
});
for (const button of document.querySelectorAll('button[data-stage]'))
  button.addEventListener('click', () => {
    const name = button.dataset.stage,
      stage = stages[name];
    viewport.dataset.stage = name;
    for (const option of document.querySelectorAll('button[data-stage]'))
      option.setAttribute('aria-pressed', String(option === button));
    for (const card of windows)
      card.classList.toggle(
        'is-active',
        stage.active.includes(card.dataset.node),
      );
    document.querySelector('#stage-label').textContent = stage.label;
    document.querySelector('#stage-description').textContent = stage.text;
  });
const setup = {
  desktop: {
    commands:
      "git clone https://github.com/onyxfuzzx/AgentCanvas.git\ncd AgentCanvas\nnpm ci\ncargo install tauri-cli --version '^2' --locked\nnpm run desktop",
    note: 'This starts the native desktop app. Install and sign in to your agent CLIs separately.',
  },
  editor: {
    commands:
      'git clone https://github.com/onyxfuzzx/AgentCanvas.git\ncd AgentCanvas\nnpm ci\nnpm run extension:package',
    note: `Install the generated VSIX from artifacts/ in VS Code or Antigravity IDE. Then run “${productName}: Open Canvas” in a trusted local project.`,
  },
};
const code = document.querySelector('#setup-code'),
  copy = document.querySelector('.copy-button'),
  status = document.querySelector('.copy-status');
let copyTimer;
for (const button of document.querySelectorAll('[data-install]'))
  button.addEventListener('click', () => {
    const content = setup[button.dataset.install];
    for (const option of document.querySelectorAll('[data-install]'))
      option.setAttribute('aria-pressed', String(option === button));
    code.textContent = content.commands;
    document.querySelector('#setup-note').textContent = content.note;
    clearTimeout(copyTimer);
    copy.querySelector('span').textContent = 'Copy';
    status.textContent = '';
  });
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(code.textContent);
    copy.querySelector('span').textContent = 'Copied';
    status.textContent = 'Setup commands copied.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent =
      'Commands selected. Use your keyboard or browser menu to copy them.';
    copy.querySelector('span').textContent = 'Selected';
  }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copy.querySelector('span').textContent = 'Copy';
  }, 2500);
});
function updateViewport() {
  const mobile = matchMedia('(max-width: 560px)').matches;
  for (const handle of document.querySelectorAll('.drag-handle'))
    handle.disabled = mobile;
  updateConnections();
}
window.addEventListener('resize', updateViewport);
updateViewport();
