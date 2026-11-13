import { createStore } from 'zustand/vanilla';
import { invoke, isDesktop } from '../native';
import { useCanvas } from '../canvas/store';
import {
  BrowserController,
  type BrowserStatus,
  type Surface,
} from './controller';
import { visibleRegions } from './geometry';

export const browsers = new BrowserController(invoke);
export const browserState = createStore<{
  sessions: BrowserStatus[];
  error: string;
}>(() => ({ sessions: [], error: '' }));

/** DOM rects are logical client pixels, including the world transform exactly once. */
export function startBrowserSurfaces() {
  if (!isDesktop()) return () => {};
  let stopped = false,
    frame = 0,
    lastPoll = 0,
    polling = false;
  let dirty = true;
  let pixelRatio = window.devicePixelRatio;
  const invalidate = () => {
    dirty = true;
  };
  const stopCanvas = useCanvas.subscribe((s, p) => {
    if (s.nodes !== p.nodes || s.viewport !== p.viewport) invalidate();
  });
  const stopState = browserState.subscribe((s, p) => {
    if (
      s.error !== p.error ||
      s.sessions.length !== p.sessions.length ||
      s.sessions.some((v, i) => v.id !== p.sessions[i]?.id)
    )
      invalidate();
  });
  const overlay =
    '.modal-backdrop,.workspace-loading,.collaboration-panel,.drawing-tools,.canvas-controls,.minimap,.canvas-hint,.pending-badge,.notes-warning,.workspace-warning,.notice,.marquee,.drawing-preview';
  const mutations = new MutationObserver((records) => {
    if (
      records.some((r) => {
        const target =
          r.target instanceof Element ? r.target : r.target.parentElement;
        if (
          r.attributeName === 'inert' ||
          target?.matches('.canvas,[inert]') ||
          target?.closest(overlay)
        )
          return true;
        return [...r.addedNodes, ...r.removedNodes].some(
          (n) =>
            n instanceof Element &&
            (n.matches(overlay) || Boolean(n.querySelector(overlay))),
        );
      })
    )
      invalidate();
  });
  mutations.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'inert'],
  });
  const resize = new ResizeObserver(invalidate);
  const initialCanvas = document.querySelector('.canvas');
  if (initialCanvas) resize.observe(initialCanvas);
  window.addEventListener('resize', invalidate);
  document.addEventListener('visibilitychange', invalidate);
  const tick = () => {
    if (stopped) return;
    const canvas = document.querySelector<HTMLElement>('.canvas');
    const state = useCanvas.getState();
    const sessions = browserState.getState().sessions;
    if (pixelRatio !== window.devicePixelRatio) {
      pixelRatio = window.devicePixelRatio;
      invalidate();
    }
    if (dirty) {
      dirty = false;
      const suspended =
        Boolean(browserState.getState().error) ||
        document.hidden ||
        Boolean(
          document.querySelector(
            '.modal-backdrop,.workspace-loading,[inert],.marquee,.drawing-preview',
          ),
        ) ||
        canvas?.classList.contains('drawing-ready') ||
        canvas?.classList.contains('pan-ready');
      const surfaces: Surface[] = [];
      if (canvas && sessions.length && !suspended) {
        const canvasRect = canvas.getBoundingClientRect();
        const covers = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.drawing-tools,.canvas-controls,.minimap,.canvas-hint,.pending-badge,.notes-warning,.collaboration-panel,.workspace-warning,.notice',
          ),
        );
        const coverRects = covers.map((e) => e.getBoundingClientRect());
        // Each node is measured once per layout update, shared by all browser surfaces.
        const nodeRects = new Map(
          Array.from(document.querySelectorAll<HTMLElement>('[data-node]')).map(
            (e) => [e.dataset.node, e.getBoundingClientRect()],
          ),
        );
        for (const session of sessions) {
          const index = state.nodes.findIndex(
            (n) => n.id === session.id && n.kind === 'browser',
          );
          const node = state.nodes[index];
          const host = document.querySelector<HTMLElement>(
            `[data-browser-host="${session.id}"]`,
          );
          if (!node || !host || suspended) continue;
          const bounds = host.getBoundingClientRect();
          const higher = state.nodes
            .filter((n, i) => n.z > node.z || (n.z === node.z && i > index))
            .flatMap((n) => {
              const rect = nodeRects.get(n.id);
              return rect
                ? [
                    {
                      x: rect.x - 4,
                      y: rect.y - 4,
                      width: rect.width + 8,
                      height: rect.height + 8,
                    },
                  ]
                : [];
            });
          const resize = host
            .closest('[data-node]')
            ?.querySelector('.resize-handle');
          const clips = visibleRegions(bounds, canvasRect, [
            ...higher,
            ...coverRects,
            ...(resize ? [resize.getBoundingClientRect()] : []),
          ]);
          if (clips.length)
            surfaces.push({
              id: node.id,
              bounds: {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
              },
              clips,
              zoom: state.viewport.zoom,
            });
        }
      }
      void browsers
        .sync(
          surfaces,
          state.nodes.filter((n) => n.kind === 'browser').map((n) => n.id),
          window.devicePixelRatio,
        )
        .catch((error) => {
          // Stop repeated failing updates; another explicit open resets this state.
          browserState.setState({ error: String(error) });
        });
    }
    if (
      (sessions.length || state.nodes.some((n) => n.kind === 'browser')) &&
      performance.now() - lastPoll > 400 &&
      !polling
    ) {
      polling = true;
      lastPoll = performance.now();
      void invoke<BrowserStatus[]>('browser_snapshot')
        .then((sessions) => {
          sessions.sort((a, b) => a.id.localeCompare(b.id));
          if (
            !stopped &&
            JSON.stringify(sessions) !==
              JSON.stringify(browserState.getState().sessions)
          )
            browserState.setState({ sessions });
        })
        .catch((error) => {
          if (!stopped) browserState.setState({ error: String(error) });
        })
        .finally(() => {
          polling = false;
        });
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    stopCanvas();
    stopState();
    mutations.disconnect();
    resize.disconnect();
    window.removeEventListener('resize', invalidate);
    document.removeEventListener('visibilitychange', invalidate);
  };
}
