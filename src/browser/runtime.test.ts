import { afterEach, expect, test, vi } from 'vitest';
import { useCanvas } from '../canvas/store';
import { startBrowserSurfaces, browserState } from './runtime';
import { invoke } from '../native';
vi.mock('../native', () => ({
  isDesktop: () => true,
  invoke: vi.fn(async (command: string) =>
    command === 'browser_snapshot' ? [] : undefined,
  ),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('idle frames avoid layout measurement; geometry, DPR and modal changes invalidate and cleanup cancels work', async () => {
  let nextFrame: FrameRequestCallback | undefined;
  let changed: MutationCallback | undefined;
  const measure = vi.fn(() => ({ x: 100, y: 100, width: 600, height: 400 }));
  const canvas = {
    getBoundingClientRect: measure,
    classList: { contains: () => false },
  };
  const host = { getBoundingClientRect: measure, closest: () => null };
  let modal = false;
  const cancel = vi.fn();
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('document', {
    body: {},
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: (selector: string) =>
      selector === '.canvas'
        ? canvas
        : selector.startsWith('[data-browser-host')
          ? host
          : modal
            ? {}
            : null,
    querySelectorAll: () => [],
  });
  vi.stubGlobal('Element', class Element {});
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    nextFrame = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', cancel);
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(callback: MutationCallback) {
        changed = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const id = '00000000-0000-4000-8000-000000000001';
  useCanvas.getState().restore(
    [
      {
        id,
        kind: 'browser',
        title: 'Browser',
        url: '',
        x: 0,
        y: 0,
        width: 600,
        height: 400,
        z: 1,
        color: '#ffffff',
      },
    ],
    { x: 0, y: 0, zoom: 1 },
    false,
  );
  browserState.setState({
    error: '',
    sessions: [
      { id, url: 'https://example.com', title: 'Example', loading: false },
    ],
  });
  const stop = startBrowserSurfaces();
  const frame = async () => {
    nextFrame!(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  await frame();
  const first = measure.mock.calls.length;
  expect(first).toBeGreaterThan(0);
  for (let i = 0; i < 120; i++) await frame();
  expect(measure).toHaveBeenCalledTimes(first);
  expect(
    vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === 'browser_sync'),
  ).toHaveLength(1);
  useCanvas.getState().setViewport({ x: 10, y: 0, zoom: 1 });
  await frame();
  expect(measure.mock.calls.length).toBeGreaterThan(first);
  const beforeDpi = measure.mock.calls.length;
  window.devicePixelRatio = 1.5;
  await frame();
  expect(measure.mock.calls.length).toBeGreaterThan(beforeDpi);
  modal = true;
  changed!(
    [
      { attributeName: 'inert', target: {}, addedNodes: [], removedNodes: [] },
    ] as unknown as MutationRecord[],
    {} as MutationObserver,
  );
  await frame();
  expect(vi.mocked(invoke).mock.calls.at(-1)?.[1]).toMatchObject({
    surfaces: [],
  });
  modal = false;
  changed!(
    [
      { attributeName: 'inert', target: {}, addedNodes: [], removedNodes: [] },
    ] as unknown as MutationRecord[],
    {} as MutationObserver,
  );
  await frame();
  browserState.setState({ error: 'failure' });
  await frame();
  const hidden = measure.mock.calls.length;
  browserState.setState({ error: '' });
  await frame();
  expect(measure.mock.calls.length).toBeGreaterThan(hidden);
  stop();
  expect(cancel).toHaveBeenCalledOnce();
  const final = measure.mock.calls.length;
  await frame();
  expect(measure).toHaveBeenCalledTimes(final);
  vi.restoreAllMocks();
});
