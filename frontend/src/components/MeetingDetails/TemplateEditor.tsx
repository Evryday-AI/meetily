"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { moveTemplateSection, serializeTemplate, type SummaryTemplate, type TemplateInfo, type TemplateSection } from '@/lib/summary-templates';
interface TemplateEditorProps {
  availableTemplates: TemplateInfo[];
  selectedTemplate: string;
  disabled: boolean;
  refreshTemplates: () => Promise<void>;
  onTemplateSelect: (id: string, name: string) => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}

const emptyTemplate = (): SummaryTemplate => ({ name: '', description: '', sections: [{ title: '', instruction: '', format: 'paragraph' }] });
const inputClass = 'mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm disabled:bg-gray-50';

export function TemplateEditor({ availableTemplates, selectedTemplate, disabled, refreshTemplates, onTemplateSelect, onClose, onBusyChange }: TemplateEditorProps) {
  const [draft, setDraft] = useState<SummaryTemplate>(emptyTemplate);
  const [sourceId, setSourceId] = useState(selectedTemplate);
  const [editId, setEditId] = useState<string | null>(null);
  const [editable, setEditable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [requestedSourceId, setRequestedSourceId] = useState(selectedTemplate);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const operationRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const load = async (id: string) => {
    if (operationRef.current) return;
    operationRef.current = true;
    setRequestedSourceId(id);
    setBusy(true); setError(null); setLoadFailed(false);
    try {
      const template = await invoke<SummaryTemplate>('api_get_template', { templateId: id });
      if (!mountedRef.current) return;
      setDraft(template); setSourceId(id); setLoaded(true);
      const isCustom = availableTemplates.find(template => template.id === id)?.is_custom === true;
      setEditId(isCustom ? id : null); setEditable(isCustom);
      setConfirmDelete(false); setDeleted(false);
    } catch (error) {
      if (mountedRef.current) { setError(`Could not load template: ${String(error)}. Retry or create a new template.`); setLoadFailed(true); }
    } finally {
      operationRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void load(selectedTemplate);
    return () => { mountedRef.current = false; };
    // A new editor session loads the selected template once; choosing another source calls load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = (duplicate: boolean) => {
    if (disabled || operationRef.current) return;
    setDraft(duplicate ? { ...draft, name: `${draft.name} (copy)`, sections: draft.sections.map(section => ({ ...section })) } : emptyTemplate());
    setEditId(null); setEditable(true); setLoaded(duplicate); setError(null);
    setLoadFailed(false); setConfirmDelete(false); setDeleted(false); setSourceId('');
  };

  const updateSection = (index: number, changes: Partial<TemplateSection>) => {
    setDraft(current => ({ ...current, sections: current.sections.map((section, i) => i === index ? { ...section, ...changes } : section) }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || operationRef.current || !editable || deleted) return;
    operationRef.current = true; setBusy(true); setError(null);
    let saved: TemplateInfo | null = null;
    try {
      const templateJson = serializeTemplate(draft);
      saved = await invoke<TemplateInfo>('api_save_custom_template', { templateId: editId, templateJson });
      // Keep the returned ID even if refreshing fails, so retries update this file.
      setEditId(saved.id);
      await refreshTemplates();
      onTemplateSelect(saved.id, saved.name); onClose();
    } catch (error) {
      setError(saved ? `Template saved, but the selector could not refresh: ${String(error)}. Retry saving to refresh and select it.` : `Could not save template: ${String(error)}`);
    } finally {
      operationRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const remove = async () => {
    if (disabled || operationRef.current || !editId) return;
    operationRef.current = true; setBusy(true); setError(null);
    let removed = deleted;
    try {
      if (!removed) { await invoke('api_delete_custom_template', { templateId: editId }); removed = true; setDeleted(true); }
      await refreshTemplates(); onClose();
    } catch (error) {
      setError(removed ? `Template deleted, but the selector could not refresh: ${String(error)}. Retry the refresh.` : `Could not delete template: ${String(error)}`);
    } finally {
      operationRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" aria-busy={busy}>
      <fieldset disabled={disabled || busy} className="flex flex-wrap items-center gap-2">
        <label className="flex-1 min-w-40 text-sm">Start from a template
          <select aria-label="Start from a template" className={inputClass} value={sourceId} onChange={event => { void load(event.target.value); }}>
            <option value="" disabled>New custom template</option>
            {availableTemplates.map(template => <option key={template.id} value={template.id}>{template.name}{template.is_custom ? ' (custom)' : ''}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={() => reset(false)}>New template</Button>
        <Button type="button" variant="outline" disabled={!loaded || deleted} onClick={() => reset(true)}>Duplicate template</Button>
      </fieldset>
      {busy && <p role="status" className="text-sm text-gray-600">Working on template…</p>}
      {disabled && <p className="text-sm text-gray-600">Wait for summary generation to finish before editing templates.</p>}
      {error && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loadFailed && <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => { void load(requestedSourceId); }}>Retry loading</Button>}
      {!editable && loaded && <p className="text-sm text-gray-600">This template is protected. Duplicate it to create an editable copy.</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <fieldset disabled={disabled || busy || !editable || deleted} className="min-w-0 space-y-3">
          <label className="block text-sm font-medium">Template name
            <input aria-label="Template name" className={inputClass} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="block text-sm font-medium">Description
            <textarea aria-label="Description" className={inputClass} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} />
          </label>
          {draft.sections.map((section, index) => <div key={index} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Section {index + 1}</span>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" disabled={index === 0} aria-label={`Move section ${index + 1} up`} onClick={() => setDraft(moveTemplateSection(draft, index, -1))}>↑</Button>
                <Button type="button" variant="outline" size="sm" disabled={index === draft.sections.length - 1} aria-label={`Move section ${index + 1} down`} onClick={() => setDraft(moveTemplateSection(draft, index, 1))}>↓</Button>
                <Button type="button" variant="outline" size="sm" aria-label={`Remove section ${index + 1}`} onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== index) })}>Remove</Button>
              </div>
            </div>
            <label className="block text-sm">Title<input aria-label={`Section ${index + 1} title`} className={inputClass} value={section.title} onChange={event => updateSection(index, { title: event.target.value })} /></label>
            <label className="block text-sm">Instruction<textarea aria-label={`Section ${index + 1} instruction`} className={inputClass} rows={3} value={section.instruction} onChange={event => updateSection(index, { instruction: event.target.value })} /></label>
            <label className="block text-sm">Format<select aria-label={`Section ${index + 1} format`} className={inputClass} value={section.format} onChange={event => updateSection(index, { format: event.target.value as TemplateSection['format'] })}>
              <option value="paragraph">Paragraph</option><option value="list">List</option><option value="string">Short text</option>
            </select></label>
          </div>)}
          <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, sections: [...draft.sections, { title: '', instruction: '', format: 'paragraph' }] })}>Add section</Button>
        </fieldset>
        <div className="min-w-0 rounded-md bg-gray-50 p-4" aria-label="Structural preview">
          <h3 className="font-semibold">Structural preview</h3>
          <p className="mt-1 text-xs text-gray-500">Example layout; no AI request is made.</p>
          <h4 className="mt-4 break-words font-semibold">{draft.name || 'Untitled template'}</h4>
          <p className="mt-1 break-words text-sm text-gray-600">{draft.description}</p>
          {draft.sections.map((section, index) => <div key={index} className="mt-4 break-words text-sm">
            <h5 className="font-medium">{section.title || `Section ${index + 1}`}</h5>
            {section.format === 'list' ? <ul className="ml-5 list-disc text-gray-500"><li>Example item</li><li>Example item</li></ul> : <p className="text-gray-500">{section.format === 'string' ? 'Example short text' : 'Example paragraph with the information requested by this section.'}</p>}
          </div>)}
        </div>
      </div>
      <fieldset disabled={disabled || busy} className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <div>
          {editId && !deleted && !confirmDelete && <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>Delete template</Button>}
          {confirmDelete && !deleted && <div className="flex flex-wrap items-center gap-2"><span className="text-sm">Delete this custom template?</span><Button type="button" variant="destructive" onClick={() => { void remove(); }}>Confirm delete</Button><Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel delete</Button></div>}
          {deleted && <Button type="button" variant="outline" onClick={() => { void remove(); }}>Retry refresh</Button>}
        </div>
        <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Close</Button><Button type="submit" disabled={!editable || deleted || disabled || busy}>Save template</Button></div>
      </fieldset>
    </form>
  );
}
