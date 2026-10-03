import { buildMeetingDocument, exportExtensions, meetingExportFilename, type ExportFormat } from './model';
import { renderMeetingExport } from './render';
import { fetchCompleteTranscripts, type FetchTranscriptPage } from './transcripts';

export interface ExportOptions {
  meetingId: string; title: string; createdAt: string;
  getSummaryMarkdown: () => Promise<string>; includeTranscript: boolean; format: ExportFormat;
}
export interface ExportIO {
  fetchPage: FetchTranscriptPage;
  save: (args: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>;
}
export async function performMeetingExport(options: ExportOptions, io: ExportIO): Promise<'saved' | 'cancelled'> {
  const summaryMarkdown = await options.getSummaryMarkdown();
  const transcripts = options.includeTranscript ? await fetchCompleteTranscripts(options.meetingId, io.fetchPage) : [];
  const document = buildMeetingDocument({ title: options.title, createdAt: options.createdAt, summaryMarkdown, transcripts });
  const bytes = await renderMeetingExport(document, options.format);
  const path = await io.save({ defaultPath: meetingExportFilename(options.title, options.format), filters: [{ name: options.format === 'markdown' ? 'Markdown' : options.format.toUpperCase(), extensions: [exportExtensions[options.format]] }] });
  if (path === null) return 'cancelled';
  await io.writeFile(path, bytes);
  return 'saved';
}
export async function exportMeeting(options: ExportOptions): Promise<'saved' | 'cancelled'> {
  const [{ invoke }, { save }, { writeFile }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  return performMeetingExport(options, { fetchPage: args => invoke('api_get_meeting_transcripts', args), save, writeFile });
}
