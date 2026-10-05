import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const originalSave = { ...await import('../../src/lib/meeting-export/save') };
let finish: ((value: 'saved' | 'cancelled') => void) | undefined;
let fail: ((error: Error) => void) | undefined;
const runExport = mock((...args: unknown[]) => new Promise<'saved' | 'cancelled'>((resolve, reject) => { finish = resolve; fail = reject; }));
mock.module('../../src/lib/meeting-export/save', () => ({ ...originalSave, exportMeeting: runExport }));
const { ExportMenu } = await import('../../src/components/MeetingDetails/ExportMenu');
let renderer: ReactTestRenderer;
beforeEach(() => { runExport.mockClear(); finish = undefined; fail = undefined; mock.module('../../src/lib/meeting-export/save', () => ({ ...originalSave, exportMeeting: runExport })); });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
afterAll(() => { mock.module('../../src/lib/meeting-export/save', () => originalSave); });
async function show(hasSummary: boolean, hasTranscripts: boolean, disabled = false) {
  await act(async () => { renderer = create(<ExportMenu meeting={{ id: 'meeting', title: 'Unsaved title', created_at: '2026-10-02' }} hasSummary={hasSummary} hasTranscripts={hasTranscripts} disabled={disabled} getSummaryMarkdown={async () => 'Unsaved text'} />); });
}
const control = (label: string) => renderer.root.findByProps({ 'aria-label': label });
test('enables transcript-only export with transcript included by default, and disables empty/generating meetings', async () => {
  await show(false, true);
  expect(control('Include transcript').props.checked).toBe(true);
  expect(control('Export meeting').props.disabled).toBe(false);
  await act(async () => renderer.unmount());
  await show(false, false);
  expect(control('Export meeting').props.disabled).toBe(true);
  await act(async () => renderer.unmount());
  await show(true, true, true);
  expect(control('Export format').props.disabled).toBe(true);
});
test('locks controls during export, prevents duplicates and retains selections after a failed write', async () => {
  await show(true, true);
  await act(async () => { control('Export format').props.onChange({ target: { value: 'docx' } }); });
  await act(async () => { control('Include transcript').props.onChange({ target: { checked: true } }); });
  let running: Promise<void>;
  await act(async () => { running = control('Export meeting').props.onClick(); });
  expect(control('Export format').props.disabled).toBe(true);
  expect(control('Include transcript').props.disabled).toBe(true);
  await act(async () => { await control('Export meeting').props.onClick(); });
  expect(runExport).toHaveBeenCalledTimes(1);
  const options = runExport.mock.calls[0][0] as Parameters<typeof originalSave.exportMeeting>[0];
  expect(options.title).toBe('Unsaved title'); expect(await options.getSummaryMarkdown()).toBe('Unsaved text');
  await act(async () => { fail!(new Error('Disk full')); await running!; });
  expect(JSON.stringify(renderer.toJSON())).toContain('Disk full');
  expect(control('Export format').props.value).toBe('docx');
  expect(control('Include transcript').props.checked).toBe(true);
  expect(control('Export meeting').props.disabled).toBe(false);
});
test('cancellation returns controls to idle without an error', async () => {
  await show(true, false);
  let running: Promise<void>;
  await act(async () => { running = control('Export meeting').props.onClick(); });
  await act(async () => { finish!('cancelled'); await running!; });
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
  expect(control('Export meeting').props.disabled).toBe(false);
});
