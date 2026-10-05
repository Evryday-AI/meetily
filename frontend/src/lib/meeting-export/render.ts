import type { ExportFormat, MeetingDocument } from './model';
export async function renderMeetingExport(document: MeetingDocument, format: ExportFormat): Promise<Uint8Array> {
  if (format === 'markdown') return new TextEncoder().encode((await import('./markdown')).renderMarkdown(document));
  if (format === 'docx') return (await import('./docx')).renderDocx(document);
  if (format === 'pdf') return (await import('./pdf')).renderPdf(document);
  throw new Error('Unsupported export format');
}
