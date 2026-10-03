import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Transcript } from '@/types';

export type ExportFormat = 'markdown' | 'pdf' | 'docx';
export type DocumentBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: DocumentBlock[][] }
  | { type: 'table'; rows: string[][] };
export interface MeetingDocument { title: string; blocks: DocumentBlock[] }
interface MarkdownNode { type: string; value?: string; alt?: string; url?: string; depth?: number; ordered?: boolean; start?: number; checked?: boolean | null; children?: MarkdownNode[] }

function inlineText(node: MarkdownNode): string {
  if (node.type === 'break') return '\n';
  if (node.type === 'image') return node.alt ? `[Image: ${node.alt}]` : '[Image]';
  if (node.type === 'link') return `${(node.children || []).map(inlineText).join('')} (${node.url || ''})`;
  return node.value ?? (node.children || []).map(inlineText).join('');
}

function convertNodes(nodes: MarkdownNode[]): DocumentBlock[] {
  return nodes.flatMap((node): DocumentBlock[] => {
    if (node.type === 'heading') return [{ type: 'heading', level: node.depth || 1, text: inlineText(node) }];
    if (node.type === 'list') return [{ type: 'list', ordered: !!node.ordered, start: node.start ?? 1, items: (node.children || []).map(item => {
      const blocks = convertNodes(item.children || []);
      if (typeof item.checked === 'boolean' && blocks[0]?.type === 'paragraph') blocks[0].text = `[${item.checked ? 'x' : ' '}] ${blocks[0].text}`;
      return blocks;
    }) }];
    if (node.type === 'table') return [{ type: 'table', rows: (node.children || []).map(row => (row.children || []).map(inlineText)) }];
    if (node.type === 'blockquote') return convertNodes(node.children || []);
    if (node.type === 'thematicBreak') return [];
    const text = inlineText(node).trim();
    return text ? [{ type: 'paragraph', text }] : [];
  });
}

export function formatTranscriptTime(transcript: Transcript): string {
  const seconds = transcript.audio_start_time ?? transcript.chunk_start_time;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return 'time unavailable';
  const total = Math.floor(seconds);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':');
}

export function formatMeetingDate(createdAt: string, timeZone?: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(createdAt)) return createdAt;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

export function buildMeetingDocument({ title, createdAt, summaryMarkdown, transcripts }: {
  title: string; createdAt: string; summaryMarkdown: string; transcripts: Transcript[];
}): MeetingDocument {
  const ast = unified().use(remarkParse).use(remarkGfm).parse(summaryMarkdown) as unknown as MarkdownNode;
  const summary = convertNodes(ast.children || []);
  const transcript = transcripts.filter(t => t.text.trim()).map((t): DocumentBlock => ({ type: 'paragraph', text: `[${formatTranscriptTime(t)}] ${t.text}` }));
  if (!summary.length && !transcript.length) throw new Error('Cannot export an empty meeting. Add a summary or transcript first.');
  const dateText = formatMeetingDate(createdAt);
  const blocks: DocumentBlock[] = [{ type: 'heading', level: 1, text: title.trim() || 'Untitled meeting' }, { type: 'paragraph', text: `Date: ${dateText}` }];
  if (summary.length) blocks.push({ type: 'heading', level: 2, text: 'Summary' }, ...summary);
  if (transcript.length) blocks.push({ type: 'heading', level: 2, text: 'Transcript' }, ...transcript);
  return { title: title.trim() || 'Untitled meeting', blocks };
}

export const exportExtensions: Record<ExportFormat, string> = { markdown: 'md', pdf: 'pdf', docx: 'docx' };
export function meetingExportFilename(title: string, format: ExportFormat): string {
  let name = title.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').trim().replace(/(?:\.(?:pdf|docx|md))+$/i, '').replace(/[. ]+$/g, '').slice(0, 120).trim();
  if (!name) name = 'meeting';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `meeting-${name}`;
  return `${name}.${exportExtensions[format]}`;
}
