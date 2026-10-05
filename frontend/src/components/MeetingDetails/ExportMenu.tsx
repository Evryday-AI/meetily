'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { exportMeeting } from '@/lib/meeting-export/save';
import type { ExportFormat } from '@/lib/meeting-export/model';

interface ExportMenuProps {
  meeting: { id: string; title: string; created_at: string };
  getSummaryMarkdown: () => Promise<string>;
  hasSummary: boolean;
  hasTranscripts: boolean;
  disabled?: boolean;
}

export function ExportMenu({ meeting, getSummaryMarkdown, hasSummary, hasTranscripts, disabled = false }: ExportMenuProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [includeTranscript, setIncludeTranscript] = useState(!hasSummary && hasTranscripts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const locked = disabled || busy;

  useEffect(() => { setIncludeTranscript(!hasSummary && hasTranscripts); setError(null); }, [meeting.id, hasSummary, hasTranscripts]);

  const handleExport = async () => {
    if (running.current || disabled || (!hasSummary && !hasTranscripts)) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await exportMeeting({ meetingId: meeting.id, title: meeting.title, createdAt: meeting.created_at, getSummaryMarkdown, includeTranscript: hasTranscripts && (!hasSummary || includeTranscript), format });
      if (result === 'saved') toast.success('Meeting exported');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2 flex-wrap">
      <select aria-label="Export format" value={format} disabled={locked} onChange={event => setFormat(event.target.value as ExportFormat)} className="h-8 rounded-md border border-input bg-white px-2 text-xs disabled:opacity-50">
        <option value="pdf">PDF</option><option value="docx">DOCX</option><option value="markdown">Markdown</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-gray-600">
        <input type="checkbox" aria-label="Include transcript" checked={hasTranscripts && (!hasSummary || includeTranscript)} disabled={locked || !hasTranscripts || !hasSummary} onChange={event => setIncludeTranscript(event.target.checked)} />Transcript
      </label>
      <Button aria-label="Export meeting" variant="outline" size="sm" disabled={locked || (!hasSummary && !hasTranscripts)} onClick={handleExport}>
        <Download size={16} /><span>{busy ? 'Exporting…' : 'Export'}</span>
      </Button>
    </div>
    {error && <p role="alert" className="max-w-sm text-xs text-red-600">Export failed: {error}</p>}
  </div>;
}
