import type { PaginatedTranscriptsResponse, Transcript } from '@/types';
export type FetchTranscriptPage = (args: { meetingId: string; limit: number; offset: number }) => Promise<PaginatedTranscriptsResponse>;

export async function fetchCompleteTranscripts(meetingId: string, fetchPage: FetchTranscriptPage): Promise<Transcript[]> {
  const result: Transcript[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  while (true) {
    const page = await fetchPage({ meetingId, limit: 100, offset: result.length });
    const incomplete = () => new Error('Could not retrieve the complete transcript. Reload the meeting and retry export.');
    if (!page || !Array.isArray(page.transcripts) || !Number.isSafeInteger(page.total_count) || page.total_count < 0 || typeof page.has_more !== 'boolean') throw incomplete();
    total ??= page.total_count;
    if (total !== page.total_count || page.transcripts.length > 100 || (page.has_more && !page.transcripts.length)) throw incomplete();
    for (const transcript of page.transcripts) {
      if (!transcript || typeof transcript.id !== 'string' || !transcript.id || typeof transcript.text !== 'string' || ids.has(transcript.id)) throw incomplete();
      ids.add(transcript.id);
      result.push(transcript);
    }
    if (result.length > total || page.has_more !== (result.length < total)) throw incomplete();
    if (!page.has_more) return result;
  }
}
