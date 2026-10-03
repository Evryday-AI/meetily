import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const originalCore = { ...await import('@tauri-apps/api/core') };
const originalToast = { ...await import('sonner') };
const originalAnalytics = { ...await import('../../src/lib/analytics') };
let templates = [{ id: 'standard_meeting', name: 'Standard', description: 'Notes', is_custom: false }];
let failList = false;
const invoke = mock(async (command: string) => {
  if (command === 'api_list_templates') {
    if (failList) throw new Error('Cannot read templates directory');
    return templates;
  }
  throw new Error(`Unexpected command: ${command}`);
});
mock.module('@tauri-apps/api/core', () => ({ ...originalCore, invoke }));
mock.module('sonner', () => ({ toast: { success() {} } }));
mock.module('../../src/lib/analytics', () => ({ default: { trackFeatureUsed() {} } }));
const { useTemplates } = await import('../../src/hooks/meeting-details/useTemplates');
let state: ReturnType<typeof useTemplates>;
function Harness() { state = useTemplates(); return null; }
let renderer: ReactTestRenderer;
let previousWindow: PropertyDescriptor | undefined;
beforeEach(async () => {
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { ...globalThis.window, __TAURI_INTERNALS__: { invoke } } });
  mock.module('@tauri-apps/api/core', () => ({ ...originalCore, invoke }));
  mock.module('sonner', () => ({ toast: { success() {} } }));
  mock.module('../../src/lib/analytics', () => ({ default: { trackFeatureUsed() {} } }));
  templates = [{ id: 'standard_meeting', name: 'Standard', description: 'Notes', is_custom: false }];
  failList = false;
  await act(async () => { renderer = create(<Harness />); });
});
afterEach(async () => {
  await act(async () => { renderer.unmount(); });
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
});
afterAll(() => {
  mock.module('@tauri-apps/api/core', () => originalCore);
  mock.module('sonner', () => originalToast);
  mock.module('../../src/lib/analytics', () => originalAnalytics);
});
test('refresh discovers newly saved templates and preserves selection until a selected template is deleted', async () => {
  expect(typeof state.refreshTemplates).toBe('function');
  templates = [...templates, { id: 'custom_new', name: 'New', description: 'Outcomes', is_custom: true }];
  await act(async () => { await state.refreshTemplates(); state.handleTemplateSelection('custom_new', 'New'); });
  expect(state.availableTemplates.map(t => t.id)).toContain('custom_new');
  expect(state.selectedTemplate).toBe('custom_new');
  await act(async () => { await state.refreshTemplates(); });
  expect(state.selectedTemplate).toBe('custom_new');
  templates = templates.filter(t => !t.is_custom);
  await act(async () => { await state.refreshTemplates(); });
  expect(state.selectedTemplate).toBe('standard_meeting');
});
test('failed refresh preserves available templates and exposes a retryable error', async () => {
  expect(typeof state.refreshTemplates).toBe('function');
  failList = true;
  await act(async () => { await expect(state.refreshTemplates()).rejects.toThrow('Cannot read'); });
  expect(state.availableTemplates).toHaveLength(1);
  expect(state.templatesError).toContain('Cannot read');
  failList = false;
  await act(async () => { await state.refreshTemplates(); });
  expect(state.templatesError).toBeNull();
});
