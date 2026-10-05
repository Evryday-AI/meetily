import { expect, test } from 'bun:test';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { buildMeetingDocument, formatMeetingDate, formatTranscriptTime, meetingExportFilename } from '../../src/lib/meeting-export/model';
import { fetchCompleteTranscripts } from '../../src/lib/meeting-export/transcripts';
import { getCurrentEditorMarkdown, getExportSummaryMarkdown, legacySummaryToMarkdown } from '../../src/lib/meeting-export/summary';
import { renderMeetingExport } from '../../src/lib/meeting-export/render';
import { performMeetingExport, type ExportIO } from '../../src/lib/meeting-export/save';
import type { PaginatedTranscriptsResponse, Transcript } from '../../src/types';

const segment = (id: string, start = 0): Transcript => ({ id, text: `Segment ${id}`, timestamp: '12:00:00', audio_start_time: start });
const input = { title: 'Project review', createdAt: '2026-10-02T15:00:00Z', summaryMarkdown: '## Decisions\n\nA paragraph.\n\n- Ship release\n- Follow up\n\n| Owner | Task |\n| --- | --- |\n| Jo | Test |', transcripts: [segment('first', 65)] };
const doc = () => buildMeetingDocument(input);

test('shared model preserves headings, paragraphs, lists, tables and recording-relative transcript times', () => {
  const model = doc();
  expect(model.blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'heading', 'heading', 'paragraph', 'list', 'table', 'heading', 'paragraph']);
  expect(JSON.stringify(model)).toContain('[00:01:05] Segment first');
  expect(formatTranscriptTime({ ...segment('x'), audio_start_time: undefined, chunk_start_time: 3661 })).toBe('01:01:01');
  expect(formatTranscriptTime({ ...segment('x'), audio_start_time: undefined })).toBe('time unavailable');
});

test('transcript-only documents work and metadata alone cannot be exported', () => {
  expect(JSON.stringify(buildMeetingDocument({ ...input, summaryMarkdown: '' }))).toContain('Segment first');
  expect(() => buildMeetingDocument({ ...input, summaryMarkdown: '  ', transcripts: [] })).toThrow('empty');
  expect(() => buildMeetingDocument({ ...input, summaryMarkdown: '---', transcripts: [] })).toThrow('empty');
});

test.each(['#', '##   ', '- ', '1. ', '-\n  - ', '-\n  -\n    - ', '| | |\n| --- | --- |\n| | |'])('empty formatted summary is rejected without a transcript: %j', summaryMarkdown => {
  expect(() => buildMeetingDocument({ ...input, summaryMarkdown, transcripts: [] })).toThrow('Cannot export an empty meeting');
  expect(() => buildMeetingDocument({ ...input, summaryMarkdown, transcripts: [{ ...segment('blank'), text: ' \n ' }] })).toThrow('Cannot export an empty meeting');
});

test.each(['#', '-\n  - ', '| | |\n| --- | --- |\n| | |'])('empty formatting still permits a transcript-only document: %j', summaryMarkdown => {
  const model = buildMeetingDocument({ ...input, summaryMarkdown });
  expect(JSON.stringify(model)).toContain('Segment first');
  expect(model.blocks.some(block => block.type === 'heading' && block.text === 'Summary')).toBe(false);
});

test.each(['## Visible heading', '-\n  -\n    - Visible nested item', '| | |\n| --- | --- |\n| | Visible cell |'])('visible summary text remains valid at every block depth: %j', summaryMarkdown => {
  expect(JSON.stringify(buildMeetingDocument({ ...input, summaryMarkdown, transcripts: [] }))).toContain('Visible');
});

test('meeting date preserves the local calendar day across UTC midnight', () => {
  expect(formatMeetingDate('2026-10-03T02:00:00Z', 'America/Chicago')).toBe('2026-10-02');
  expect(formatMeetingDate('2026-10-02', 'America/Chicago')).toBe('2026-10-02');
});

test('current unsaved editor content is authoritative, including clearing the editor', async () => {
  expect(await getExportSummaryMarkdown({ getMarkdown: async () => 'Unsaved edit' }, { markdown: 'Saved' })).toBe('Unsaved edit');
  expect(await getExportSummaryMarkdown({ getMarkdown: async () => '' }, { markdown: 'Saved' })).toBe('');
  await expect(getExportSummaryMarkdown({ getMarkdown: async () => { throw new Error('conversion failed'); } }, { markdown: 'Saved' })).rejects.toThrow('conversion failed');
});

test('strict editor conversion uses empty unsaved blocks, rejects failures and rejects loading state', async () => {
  const editor = { blocksToMarkdownLossy: async (blocks: unknown[]) => JSON.stringify(blocks) };
  expect(await getCurrentEditorMarkdown(editor, [], true)).toBe('[]');
  await expect(getCurrentEditorMarkdown(editor, ['stale'], false)).rejects.toThrow('loading');
  await expect(getCurrentEditorMarkdown({ blocksToMarkdownLossy: async () => { throw new Error('Conversion failed'); } }, ['unsaved'], true)).rejects.toThrow('Conversion failed');
});

test('legacy fallback follows section order, retains extra sections, handles every block and ignores metadata', async () => {
  const summary = { MeetingName: 'Other title', _section_order: ['second', 'second', 'missing'], first: { title: 'First', blocks: [{ type: 'text', content: 'One' }, { type: 'bullet', content: 'Two' }] }, second: { title: 'Second', blocks: [{ type: 'text', content: 'Three' }] }, extra: { title: 'Extra', blocks: [{ type: 'text', content: 'Four' }] } };
  const md = legacySummaryToMarkdown(summary);
  expect(md.indexOf('Second')).toBeLessThan(md.indexOf('First'));
  expect(md).toContain('- Two'); expect(md).toContain('Four'); expect(md).not.toContain('Other title');
  expect(md.match(/Second/g)).toHaveLength(1);
  expect(await getExportSummaryMarkdown({ getMarkdown: async () => '' }, summary)).toBe(md);
});

test('fetches every backend page from offset zero regardless of visible transcript page', async () => {
  const calls: { meetingId: string; limit: number; offset: number }[] = [];
  const result = await fetchCompleteTranscripts('meeting', async args => {
    calls.push(args);
    return { transcripts: [segment(String(args.offset))], total_count: 3, has_more: args.offset < 2 };
  });
  expect(calls.map(c => c.offset)).toEqual([0, 1, 2]);
  expect(calls.every(c => c.meetingId === 'meeting' && c.limit === 100)).toBe(true);
  expect(result).toHaveLength(3);
});

test('rejects failed, incomplete, repeated, empty and changing transcript pages', async () => {
  const invalid: PaginatedTranscriptsResponse[][] = [
    [{ transcripts: [segment('1')], total_count: 2, has_more: false }],
    [{ transcripts: [], total_count: 2, has_more: true }],
    [{ transcripts: [segment('1')], total_count: 2, has_more: true }, { transcripts: [segment('1')], total_count: 2, has_more: false }],
    [{ transcripts: [segment('1')], total_count: 2, has_more: true }, { transcripts: [segment('2')], total_count: 3, has_more: true }],
    [{ transcripts: [segment('1')], total_count: 1, has_more: true }],
  ];
  for (const pages of invalid) await expect(fetchCompleteTranscripts('meeting', async () => pages.shift()!)).rejects.toThrow();
  let count = 0;
  await expect(fetchCompleteTranscripts('meeting', async () => { if (count++) throw new Error('Database unavailable'); return { transcripts: [segment('1')], total_count: 2, has_more: true }; })).rejects.toThrow('Database unavailable');
});

test('filenames remove path/control characters, Windows device names and repeated extensions', () => {
  expect(meetingExportFilename('../Client: review?.pdf', 'pdf')).toBe('Client review.pdf');
  expect(meetingExportFilename('CON', 'docx')).toBe('meeting-CON.docx');
  expect(meetingExportFilename('   ', 'markdown')).toBe('meeting.md');
  expect(meetingExportFilename('a'.repeat(300), 'markdown').length).toBeLessThanOrEqual(124);
});

// Read actual generated OOXML content without adding a ZIP test dependency.
function zipEntry(bytes: Uint8Array, target: string): string {
  const b = Buffer.from(bytes);
  for (let p = 0; p < b.length - 46; p++) {
    if (b.readUInt32LE(p) !== 0x02014b50) continue;
    const size = b.readUInt32LE(p + 20), nameSize = b.readUInt16LE(p + 28);
    if (b.subarray(p + 46, p + 46 + nameSize).toString() !== target) continue;
    const offset = b.readUInt32LE(p + 42);
    const start = offset + 30 + b.readUInt16LE(offset + 26) + b.readUInt16LE(offset + 28);
    const data = b.subarray(start, start + size);
    return (b.readUInt16LE(p + 10) === 8 ? inflateRawSync(data) : data).toString();
  }
  throw new Error(`Missing ZIP entry ${target}`);
}

test('Markdown exports the shared content as UTF-8', async () => {
  const md = new TextDecoder().decode(await renderMeetingExport(doc(), 'markdown'));
  expect(md).toContain('# Project review'); expect(md).toContain('2026-10-02');
  expect(md).toContain('- Ship release'); expect(md).toContain('| Jo | Test |');
  expect(md).toContain('\\[00:01:05\\] Segment first');
});

test('DOCX is a real OOXML ZIP with headings, lists, tables and transcript text', async () => {
  const bytes = await renderMeetingExport(doc(), 'docx');
  expect(Array.from(bytes.slice(0, 4))).toEqual([80, 75, 3, 4]);
  const xml = zipEntry(bytes, 'word/document.xml');
  for (const text of ['Project review', '2026-10-02', 'Ship release', 'Jo', 'Test', '[00:01:05] Segment first']) expect(xml).toContain(text);
  expect(xml).toContain('<w:tbl>'); expect(xml).toContain('Heading'); expect(xml).toContain('numPr');
});

test('PDF is a real local PDF containing title, summary and transcript text', async () => {
  const bytes = await renderMeetingExport(doc(), 'pdf');
  const raw = Buffer.from(bytes).toString('latin1');
  expect(raw.startsWith('%PDF-')).toBe(true); expect(raw).toContain('%%EOF');
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(m => {
    try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return m[1]; }
  }).join('\n');
  const text = [...streams.matchAll(/<([a-f\d]+)>/gi)].map(m => Buffer.from(m[1], 'hex').toString('latin1')).join('');
  const literalText = [...streams.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(m => m[1].replace(/\\([\\()])/g, '$1')).join('');
  expect(text + literalText).toContain('Project review'); expect(text + literalText).toContain('Ship release'); expect(text + literalText).toContain('Segment first');
}, 20000);

test('PDF rejects unsupported scripts explicitly while Markdown and DOCX preserve Unicode', async () => {
  const unicode = buildMeetingDocument({ ...input, summaryMarkdown: '你好 👋', transcripts: [] });
  await expect(renderMeetingExport(unicode, 'pdf')).rejects.toThrow('Markdown or DOCX');
  expect(new TextDecoder().decode(await renderMeetingExport(unicode, 'markdown'))).toContain('你好 👋');
  expect(zipEntry(await renderMeetingExport(unicode, 'docx'), 'word/document.xml')).toContain('你好 👋');
});

test('PDF paginates long tables, wrapped paragraphs and a complete long transcript', async () => {
  const markdown = `## Review\n\n${'Long wrapped meeting paragraph. '.repeat(120)}\n\n| Owner | Task |\n| --- | --- |\n${Array.from({ length: 65 }, (_, i) => `| Owner ${i} | ${'Review the item and confirm. '.repeat(i % 4 + 1)} |`).join('\n')}`;
  const long = buildMeetingDocument({ ...input, summaryMarkdown: markdown, transcripts: Array.from({ length: 130 }, (_, i) => ({ ...segment(String(i), i * 15), text: 'Complete long transcript segment. '.repeat(5) })) });
  const bytes = await renderMeetingExport(long, 'pdf');
  const raw = Buffer.from(bytes).toString('latin1');
  expect(raw.startsWith('%PDF-')).toBe(true);
  expect((raw.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(3);
}, 20000);

test('PDF preserves a table row taller than a page by continuing it across pages', async () => {
  const largeRow = buildMeetingDocument({ ...input, transcripts: [], summaryMarkdown: `| Owner | Task |\n| --- | --- |\n| Jo | ${'Long task text. '.repeat(800)}END OF ROW |` });
  const bytes = await renderMeetingExport(largeRow, 'pdf');
  const raw = Buffer.from(bytes).toString('latin1');
  expect((raw.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(2);
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(m => { try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return m[1]; } }).join('\n');
  expect(streams).toContain('END OF ROW');
}, 20000);

const options = { meetingId: 'meeting', title: input.title, createdAt: input.createdAt, getSummaryMarkdown: async () => input.summaryMarkdown, includeTranscript: true, format: 'markdown' as const };
function io(path: string | null, events: string[]): ExportIO {
  return { fetchPage: async () => { events.push('fetch'); return { transcripts: [segment('all')], total_count: 1, has_more: false }; }, save: async args => { events.push(`dialog:${args.defaultPath}`); return path; }, writeFile: async (_, bytes) => { events.push(`write:${new TextDecoder().decode(bytes).includes('Segment all')}`); } };
}
test('native dialog cancellation does not write and successful export writes complete bytes once', async () => {
  const events: string[] = [];
  expect(await performMeetingExport(options, io(null, events))).toBe('cancelled');
  expect(events).toEqual(['fetch', 'dialog:Project review.md']);
  events.length = 0;
  expect(await performMeetingExport(options, io('C:/notes.md', events))).toBe('saved');
  expect(events).toEqual(['fetch', 'dialog:Project review.md', 'write:true']);
});
test('write, summary conversion and transcript failures propagate without saving partial content', async () => {
  const events: string[] = [];
  const failing = io('C:/notes.md', events);
  failing.writeFile = async () => { throw new Error('Disk full'); };
  await expect(performMeetingExport(options, failing)).rejects.toThrow('Disk full');
  events.length = 0;
  failing.fetchPage = async () => { throw new Error('Read failed'); };
  await expect(performMeetingExport(options, failing)).rejects.toThrow('Read failed');
  expect(events).toEqual([]);
  await expect(performMeetingExport({ ...options, getSummaryMarkdown: async () => { throw new Error('Unsaved conversion failed'); } }, failing)).rejects.toThrow('Unsaved conversion failed');
});
test('summary-only export never fetches the transcript', async () => {
  const events: string[] = [];
  await performMeetingExport({ ...options, includeTranscript: false }, io('C:/notes.md', events));
  expect(events).toEqual(['dialog:Project review.md', 'write:false']);
});
