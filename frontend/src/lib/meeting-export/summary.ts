function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function escapeText(text: string): string { return text.replace(/([\\`*_{}\[\]<>#+.!|~-])/g, '\\$1'); }

export async function getCurrentEditorMarkdown<T>(editor: { blocksToMarkdownLossy: (blocks: T[]) => Promise<string> }, blocks: T[], loaded: boolean): Promise<string> {
  if (!loaded) throw new Error('The summary editor is still loading. Wait for it to open and retry export.');
  return editor.blocksToMarkdownLossy(blocks);
}

export function legacySummaryToMarkdown(value: unknown): string {
  const summary = object(value);
  if (!summary) return '';
  const order = Array.isArray(summary._section_order) ? summary._section_order.filter((key): key is string => typeof key === 'string') : [];
  const keys = [...new Set([...order, ...Object.keys(summary)])];
  return keys.flatMap(key => {
    const section = object(summary[key]);
    if (!section || !Array.isArray(section.blocks)) return [];
    const blocks = section.blocks.flatMap(value => {
      const block = object(value);
      if (typeof block?.content !== 'string' || !block.content.trim()) return [];
      const content = escapeText(block.content);
      return [block.type === 'bullet' ? `- ${content.replace(/\n/g, '\n  ')}` : content];
    });
    if (!blocks.length) return [];
    return [`## ${escapeText(typeof section.title === 'string' ? section.title : key)}\n\n${blocks.join('\n\n')}`];
  }).join('\n\n');
}

export async function getExportSummaryMarkdown(editor: { getMarkdown: () => Promise<string> } | null, value: unknown): Promise<string> {
  const summary = object(value);
  const modern = summary && ('markdown' in summary || 'summary_json' in summary);
  // Empty modern content can be an intentional unsaved deletion.
  if (editor) {
    const markdown = await editor.getMarkdown();
    if (modern || markdown.trim()) return markdown;
  }
  if (modern) {
    if (typeof summary.markdown === 'string' && !('summary_json' in summary)) return summary.markdown;
    throw new Error('The summary editor is still loading. Wait for it to open and retry export.');
  }
  return legacySummaryToMarkdown(value);
}
