import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
async function fixture(generation = 1) {
  vi.resetModules();
  const sent: Record<string, unknown>[] = [];
  let message!: (event: { data: unknown }) => void;
  const elements = new Map<
    string,
    {
      inert: boolean;
      hidden: boolean;
      disabled: boolean;
      textContent: string;
      addEventListener: ReturnType<typeof vi.fn>;
    }
  >();
  for (const id of [
    'root',
    'backend-status',
    'backend-title',
    'backend-detail',
    'backend-restart',
    'backend-close',
  ])
    elements.set(id, {
      inert: true,
      hidden: false,
      disabled: false,
      textContent: '',
      addEventListener: vi.fn(),
    });
  vi.stubGlobal('window', {
    acquireVsCodeApi: () => ({
      postMessage: (m: Record<string, unknown>) => sent.push(m),
    }),
    addEventListener: (_: string, listener: typeof message) => {
      message = listener;
    },
  });
  vi.stubGlobal('document', {
    body: { dataset: { generation: String(generation), paused: 'true' } },
    documentElement: { classList: { add: vi.fn() } },
    getElementById: (id: string) => elements.get(id),
  });
  const editor = await import('./editor');
  const receive = (data: Record<string, unknown>) =>
    message({ data: { generation, ...data } });
  return { editor, sent, elements, receive };
}
test('backend startup gates RPC, failure rejects pending calls, and old-generation replies are ignored', async () => {
  const f = await fixture(2);
  const request = f.editor.editorInvoke('workspace_list');
  await Promise.resolve();
  expect(f.sent.filter((m) => m.type === 'agentcanvas:invoke')).toEqual([]);
  f.receive({ type: 'agentcanvas:backend', state: { phase: 'connected' } });
  await Promise.resolve();
  const invoke = f.sent.find((m) => m.type === 'agentcanvas:invoke')!;
  expect(invoke.generation).toBe(2);
  f.receive({
    type: 'agentcanvas:reply',
    generation: 1,
    id: invoke.id,
    result: 'stale',
  });
  f.receive({ type: 'agentcanvas:reply', id: invoke.id, result: 'current' });
  expect(await request).toBe('current');
  const pending = f.editor.editorInvoke('workspace_list');
  const rejected = expect(pending).rejects.toThrow('broken pipe');
  f.receive({
    type: 'agentcanvas:backend',
    state: { phase: 'failed', error: 'broken pipe <script>', attempts: 3 },
  });
  await rejected;
  expect(f.elements.get('root')!.inert).toBe(true);
  expect(f.elements.get('backend-restart')!.disabled).toBe(true);
  expect(f.elements.get('backend-detail')!.textContent).toContain('<script>');
  expect(f.elements.get('backend-status')!.hidden).toBe(false);
  await expect(f.editor.editorInvoke('terminal_spawn')).rejects.toThrow(
    'broken pipe',
  );
});
test('capture sends the latest durable checkpoint before its acknowledgment without saving or launching', async () => {
  const f = await fixture();
  f.editor.registerEditorCapture(() =>
    f.editor.checkpoint('workspace_save', {
      id: 'workspace',
      layout: { nodes: [] },
    }),
  );
  f.receive({ type: 'agentcanvas:capture', id: 17 });
  expect(f.sent.slice(-2)).toEqual([
    {
      type: 'agentcanvas:checkpoint',
      generation: 1,
      command: 'workspace_save',
      args: { id: 'workspace', layout: { nodes: [] } },
    },
    { type: 'agentcanvas:captured', generation: 1, id: 17 },
  ]);
  expect(f.editor.editorRestorePaused()).toBe(true);
  expect(f.sent.some((m) => m.type === 'agentcanvas:invoke')).toBe(false);
});
