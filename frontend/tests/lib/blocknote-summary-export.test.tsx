import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { createRef, useMemo, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Block } from '@blocknote/core';
import type { BlockNoteSummaryViewRef } from '../../src/components/AISummary/BlockNoteSummaryView';
import type { SummaryDataResponse } from '../../src/types';
import { performMeetingExport, type ExportIO } from '../../src/lib/meeting-export/save';

// The real summary component and export pipeline run here. Only the DOM-dependent
// BlockNote editor boundary and native save destination are replaced.
const originals = {
  dynamic: { ...await import('next/dynamic') },
  react: { ...await import('@blocknote/react') },
  shadcn: { ...await import('@blocknote/shadcn') },
};
function EditorBoundary({ initialContent, onChange }: { initialContent: Block[]; onChange: (blocks: Block[]) => void }) {
  const [document, setDocument] = useState(initialContent);
  return <button onClick={event => { const blocks = event as unknown as Block[]; setDocument(blocks); onChange(blocks); }}>{markdown(document)}</button>;
}
function markdown(blocks: Block[]): string {
  return blocks.map(block => Array.isArray(block.content) ? block.content.map(part => 'text' in part ? part.text : '').join('') : '').join('\n');
}
function installEditorBoundary() {
  mock.module('next/dynamic', () => ({ ...originals.dynamic, default: () => EditorBoundary }));
  mock.module('@blocknote/react', () => ({ ...originals.react, useCreateBlockNote: () => useMemo(() => ({
    document: [] as Block[],
    blocksToMarkdownLossy: async (blocks: Block[]) => markdown(blocks),
    tryParseMarkdownToBlocks: async (text: string) => blocks(text),
    replaceBlocks(_old: Block[], next: Block[]) { this.document = next; },
  }), []) }));
  mock.module('@blocknote/shadcn', () => ({ ...originals.shadcn, BlockNoteView: () => null }));
}
installEditorBoundary();
const { BlockNoteSummaryView } = await import('../../src/components/AISummary/BlockNoteSummaryView');
let renderer: ReactTestRenderer | undefined;
const ref = createRef<BlockNoteSummaryViewRef>();
const meeting = { id: 'meeting', title: 'Review', created_at: '2026-10-02' };
const blocks = (text: string): Block[] => [{ id: 'paragraph', type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] }] as unknown as Block[];
const summary = (text: string): SummaryDataResponse => ({ summary_json: blocks(text) } as unknown as SummaryDataResponse);
const waitForLoad = () => new Promise<void>(resolve => setTimeout(resolve, 120));
async function show(onSave = async (_data: unknown) => {}) {
  installEditorBoundary();
  await act(async () => { renderer = create(<BlockNoteSummaryView ref={ref} summaryData={summary('Original')} meeting={meeting} onSave={onSave} />); });
  await act(waitForLoad);
}
async function edit(next: Block[]) {
  await act(async () => { renderer!.root.findByType('button').props.onClick(next); });
}
async function exportedText() {
  let text = '';
  const io: ExportIO = {
    fetchPage: async () => { throw new Error('Unexpected transcript read'); },
    save: async () => 'C:/review.md',
    writeFile: async (_path, bytes) => { text = new TextDecoder().decode(bytes); },
  };
  await performMeetingExport({ meetingId: meeting.id, title: meeting.title, createdAt: meeting.created_at, getSummaryMarkdown: () => ref.current!.getMarkdownForExport(), includeTranscript: false, format: 'markdown' }, io);
  return text;
}
afterEach(async () => { if (renderer) await act(async () => { renderer!.unmount(); renderer = undefined; }); });
afterAll(() => {
  mock.module('next/dynamic', () => originals.dynamic);
  mock.module('@blocknote/react', () => originals.react);
  mock.module('@blocknote/shadcn', () => originals.shadcn);
});

test('exports the displayed unsaved edit through the real component and export pipeline', async () => {
  await show();
  await edit(blocks('Edited'));
  expect(ref.current!.isDirty).toBe(true);
  expect(await exportedText()).toContain('Edited');
  expect(await exportedText()).not.toContain('Original');
});

test('successful save keeps displayed edits authoritative when backend does not refresh props', async () => {
  const saved: unknown[] = [];
  await show(async data => { saved.push(data); });
  await edit(blocks('Edited'));
  await act(async () => { await ref.current!.saveSummary(); });
  expect(ref.current!.isDirty).toBe(false);
  expect(saved).toEqual([{ markdown: 'Edited', summary_json: blocks('Edited') }]);
  expect(renderer!.root.findByType('button').props.children).toBe('Edited');
  expect(await exportedText()).toContain('Edited');
  expect(await exportedText()).not.toContain('Original');
});

test('failed save preserves displayed edits and dirty state for export and retry', async () => {
  await show(async () => { throw new Error('Save failed'); });
  await edit(blocks('Edited'));
  await act(async () => { await expect(ref.current!.saveSummary()).rejects.toThrow('Save failed'); });
  expect(ref.current!.isDirty).toBe(true);
  expect(await exportedText()).toContain('Edited');
});

test.each([{ label: 'no blocks', next: [] as Block[] }, { label: 'blank paragraph', next: blocks('') }])('intentional empty edits stay empty after successful save (%j)', async ({ next }) => {
  await show();
  await edit(next);
  expect(await ref.current!.getMarkdownForExport()).toBe('');
  await expect(exportedText()).rejects.toThrow('empty meeting');
  await act(async () => { await ref.current!.saveSummary(); });
  expect(ref.current!.isDirty).toBe(false);
  expect(await ref.current!.getMarkdownForExport()).toBe('');
  await expect(exportedText()).rejects.toThrow('empty meeting');
});

test('equivalent source props on ordinary parent rerenders preserve the displayed unsaved edit', async () => {
  await show();
  await edit(blocks('Edited'));
  await act(async () => { renderer!.update(<BlockNoteSummaryView ref={ref} summaryData={summary('Original')} meeting={{ ...meeting, title: 'Renamed' }} onSave={async () => {}} />); });
  await act(waitForLoad);
  expect(ref.current!.isDirty).toBe(true);
  expect(renderer!.root.findByType('button').props.children).toBe('Edited');
  expect(await exportedText()).toContain('Edited');
});

test('a newly loaded summary resets the displayed content and export snapshot together', async () => {
  await show();
  await edit(blocks('Edited'));
  await act(async () => { renderer!.update(<BlockNoteSummaryView ref={ref} summaryData={summary('Regenerated')} meeting={meeting} />); });
  await act(waitForLoad);
  expect(ref.current!.isDirty).toBe(false);
  expect(renderer!.root.findByType('button').props.children).toBe('Regenerated');
  expect(await exportedText()).toContain('Regenerated');
  expect(await exportedText()).not.toContain('Edited');
});

test('switching meetings with identical source content resets local edits', async () => {
  await show();
  await edit(blocks('Edited'));
  await act(async () => { renderer!.update(<BlockNoteSummaryView ref={ref} summaryData={summary('Original')} meeting={{ ...meeting, id: 'other-meeting' }} />); });
  await act(waitForLoad);
  expect(ref.current!.isDirty).toBe(false);
  expect(renderer!.root.findByType('button').props.children).toBe('Original');
  expect(await exportedText()).toContain('Original');
  expect(await exportedText()).not.toContain('Edited');
});
