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
  let blocked = false;
  const tick = () => {
    if (stopped) return;
    const canvas = document.querySelector<HTMLElement>('.canvas');
    const state = useCanvas.getState();
    const sessions = browserState.getState().sessions;
    const suspended =
      blocked ||
      document.hidden ||
      Boolean(
        document.querySelector(
          '.modal-backdrop,.workspace-loading,[inert],.marquee,.drawing-preview',
        ),
      ) ||
      canvas?.classList.contains('drawing-ready') ||
      canvas?.classList.contains('pan-ready');
    const surfaces: Surface[] = [];
    if (canvas) {
      const canvasRect = canvas.getBoundingClientRect();
      const covers = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.drawing-tools,.canvas-controls,.minimap,.canvas-hint,.pending-badge,.notes-warning,.collaboration-panel',
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
            const element = document.querySelector<HTMLElement>(
              `[data-node="${n.id}"]`,
            );
            return element ? [element.getBoundingClientRect()] : [];
          });
        const resize = host
          .closest('[data-node]')
          ?.querySelector('.resize-handle');
        const clips = visibleRegions(bounds, canvasRect, [
          ...higher,
          ...covers.map((e) => e.getBoundingClientRect()),
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
        blocked = true;
        browserState.setState({ error: String(error) });
      });
    if (performance.now() - lastPoll > 400 && !polling) {
      polling = true;
      lastPoll = performance.now();
      void invoke<BrowserStatus[]>('browser_snapshot')
        .then((sessions) => {
          if (!stopped) browserState.setState({ sessions });
        })
        .catch((error) => {
          if (!stopped) browserState.setState({ error: String(error) });
        })
        .finally(() => {
          polling = false;
        });
    }
    if (!browserState.getState().error) blocked = false;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
