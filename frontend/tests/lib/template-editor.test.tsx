import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { TemplateInfo } from '../../src/lib/summary-templates';
const originalCore = { ...await import('@tauri-apps/api/core') };
const preset: TemplateInfo = { id: 'standard_meeting', name: 'Standard', description: 'Notes', is_custom: false };
const custom: TemplateInfo = { id: 'custom_notes', name: 'My notes', description: 'Notes', is_custom: true };
const draft = { name: 'Standard', description: 'Notes', sections: [
  { title: 'Summary', instruction: 'Explain outcomes', format: 'paragraph', item_format: '| Owner | Task |' },
] };
let saveError: string | null;
let deleteError: string | null;
let refreshError: boolean;
let loadErrorId: string | null;
const events: string[] = [];
const invoke = mock(async (command: string, args?: Record<string, unknown>) => {
  if (command === 'api_get_template') {
    if (args?.templateId === loadErrorId) throw new Error('Template file unavailable');
    return structuredClone(draft);
  }
  if (command === 'api_save_custom_template') {
    events.push('save');
    if (saveError) throw new Error(saveError);
    return { ...custom, id: args?.templateId ?? 'custom_new', name: JSON.parse(args!.templateJson as string).name };
  }
  if (command === 'api_delete_custom_template') {
    events.push('delete');
    if (deleteError) throw new Error(deleteError);
    return;
  }
  throw new Error(`Unexpected command: ${command}`);
});
mock.module('@tauri-apps/api/core', () => ({ ...originalCore, invoke }));
const { TemplateEditor } = await import('../../src/components/MeetingDetails/TemplateEditor');
let renderer: ReactTestRenderer;
let previousWindow: PropertyDescriptor | undefined;
beforeEach(() => {
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { ...globalThis.window, __TAURI_INTERNALS__: { invoke } } });
  mock.module('@tauri-apps/api/core', () => ({ ...originalCore, invoke }));
  saveError = null; deleteError = null; refreshError = false; loadErrorId = null; events.length = 0; invoke.mockClear();
});
afterEach(async () => {
  if (renderer) await act(async () => { renderer.unmount(); });
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
});
afterAll(() => { mock.module('@tauri-apps/api/core', () => originalCore); });
async function show(selectedTemplate = preset.id, disabled = false) {
  await act(async () => { renderer = create(<TemplateEditor
    availableTemplates={[preset, custom]} selectedTemplate={selectedTemplate} disabled={disabled}
    refreshTemplates={async () => { events.push('refresh'); if (refreshError) throw new Error('Directory unavailable'); }}
    onTemplateSelect={(id) => { events.push(`select:${id}`); }} onClose={() => { events.push('close'); }}
  />); });
}
const button = (label: string) => renderer.root.findAllByType('button').find(node => node.children.includes(label))!;
const text = () => JSON.stringify(renderer.toJSON());
async function click(label: string) { await act(async () => { await button(label).props.onClick(); }); }
async function save() { await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); }

test('duplicates a built-in without its ID and refreshes before selecting the saved copy', async () => {
  await show();
  expect(renderer.root.findAllByType('form')).toHaveLength(1);
  expect(button('Save template').props.disabled).toBe(true);
  await click('Duplicate template');
  await save();
  const args = invoke.mock.calls.find(([command]) => command === 'api_save_custom_template')![1]!;
  expect(args.templateId).toBeNull();
  expect(JSON.parse(args.templateJson as string).sections[0].item_format).toBe('| Owner | Task |');
  expect(events).toEqual(['save', 'refresh', 'select:custom_new', 'close']);
});

test('failed writes keep the draft editable and show the backend error', async () => {
  await show();
  expect(renderer.root.findAllByType('form')).toHaveLength(1);
  await click('New template');
  for (const [label, value] of [['Template name', 'My draft'], ['Description', 'Outcomes'], ['Section 1 title', 'Decisions'], ['Section 1 instruction', 'List decisions']]) {
    await act(async () => { renderer.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }); });
  }
  saveError = 'Disk full. Free space and retry.';
  await save();
  expect(text()).toContain('Disk full');
  expect(renderer.root.findByProps({ 'aria-label': 'Template name' }).props.value).toBe('My draft');
  expect(button('Save template').props.disabled).toBe(false);
  expect(events).toEqual(['save']);
  saveError = null;
  await save();
  expect(events).toContain('select:custom_new');
});

test('a refresh failure after saving retains the saved ID so retries do not create duplicates', async () => {
  await show();
  expect(renderer.root.findAllByType('form')).toHaveLength(1);
  await click('Duplicate template');
  refreshError = true;
  await save();
  expect(text()).toContain('saved');
  expect(text()).toContain('Directory unavailable');
  refreshError = false;
  await save();
  expect(invoke.mock.calls.filter(([command]) => command === 'api_save_custom_template')[1][1]!.templateId).toBe('custom_new');
});

test('failed delete keeps the custom template and exposes a retry', async () => {
  await show(custom.id);
  expect(renderer.root.findAllByType('form')).toHaveLength(1);
  await click('Delete template');
  deleteError = 'File is locked';
  await click('Confirm delete');
  expect(text()).toContain('File is locked');
  expect(events).toEqual(['delete']);
  deleteError = null;
  await click('Confirm delete');
  expect(events).toEqual(['delete', 'delete', 'refresh', 'close']);
});

test('summary generation disables edits and rejects save handlers', async () => {
  await show(custom.id, true);
  expect(renderer.root.findAllByType('form')).toHaveLength(1);
  expect(renderer.root.findAllByType('fieldset').every(node => node.props.disabled)).toBe(true);
  await save();
  expect(events).toEqual([]);
});

test('retry loading uses the failed requested source while retaining the previous preview', async () => {
  await show();
  loadErrorId = custom.id;
  await act(async () => { renderer.root.findByProps({ 'aria-label': 'Start from a template' }).props.onChange({ target: { value: custom.id } }); });
  expect(text()).toContain('Template file unavailable');
  expect(renderer.root.findByProps({ 'aria-label': 'Template name' }).props.value).toBe('Standard');
  loadErrorId = null;
  await click('Retry loading');
  expect(invoke.mock.calls.filter(([command]) => command === 'api_get_template').at(-1)![1]!.templateId).toBe(custom.id);
  expect(button('Delete template')).toBeDefined();
});
