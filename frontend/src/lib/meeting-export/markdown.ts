import type { DocumentBlock, MeetingDocument } from './model';
const escape = (text: string) => text.replace(/([\\`*_{}\[\]<>|])/g, '\\$1').replace(/^(#{1,6}|[-+])(?=\s)/gm, '\\$1').replace(/^(\d+)\.(?=\s)/gm, '$1\\.');
function blockMarkdown(block: DocumentBlock): string {
  if (block.type === 'heading') return `${'#'.repeat(block.level)} ${escape(block.text)}`;
  if (block.type === 'paragraph') return escape(block.text);
  if (block.type === 'table') {
    const rows = block.rows.map(row => `| ${row.map(cell => escape(cell).replace(/\n/g, '<br>')).join(' | ')} |`);
    rows.splice(1, 0, `| ${block.rows[0].map(() => '---').join(' | ')} |`);
    return rows.join('\n');
  }
  return block.items.map((item, index) => {
    const prefix = block.ordered ? `${block.start + index}. ` : '- ';
    const text = item.map(blockMarkdown).join('\n\n');
    return prefix + text.replace(/\n/g, '\n' + ' '.repeat(prefix.length));
  }).join('\n');
}
export function renderMarkdown(document: MeetingDocument): string { return document.blocks.map(blockMarkdown).join('\n\n') + '\n'; }
