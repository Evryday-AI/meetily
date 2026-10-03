import { Document, Paragraph, Packer, Table, TableCell, TableRow, TextRun, HeadingLevel, LevelFormat, WidthType } from 'docx';
import type { DocumentBlock, MeetingDocument } from './model';

export async function renderDocx(document: MeetingDocument): Promise<Uint8Array> {
  const numbering: { reference: string; levels: { level: number; format: typeof LevelFormat.DECIMAL; text: string; start: number; style: { paragraph: { indent: { left: number; hanging: number } } } }[] }[] = [];
  function blocks(values: DocumentBlock[], depth = 0): (Paragraph | Table)[] {
    return values.flatMap((block): (Paragraph | Table)[] => {
      if (block.type === 'heading') {
        const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
        return [new Paragraph({ text: block.text, heading: headings[block.level - 1], keepNext: true, spacing: { before: 200, after: 100 } })];
      }
      if (block.type === 'paragraph') return [new Paragraph({ children: block.text.split('\n').map((line, i) => new TextRun({ text: line, break: i ? 1 : 0 })), spacing: { after: 120 } })];
      if (block.type === 'table') return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: block.rows.map((row, index) => new TableRow({ tableHeader: index === 0, children: row.map(cell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, bold: index === 0 })] })] })) })) })];
      const reference = `list-${numbering.length}`;
      if (block.ordered) numbering.push({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', start: block.start, style: { paragraph: { indent: { left: 360 * (depth + 1), hanging: 240 } } } }] });
      return block.items.flatMap(item => {
        const [first, ...rest] = item;
        const text = first && (first.type === 'paragraph' || first.type === 'heading') ? first.text : '';
        return [new Paragraph({ text, ...(block.ordered ? { numbering: { reference, level: 0 } } : { bullet: { level: Math.min(depth, 8) } }), spacing: { after: 80 } }), ...blocks(text ? rest : item, depth + 1)];
      });
    });
  }
  const children = blocks(document.blocks);
  const file = new Document({ title: document.title, creator: 'Meetily', numbering: { config: numbering }, styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children }] });
  return new Uint8Array(await (await Packer.toBlob(file)).arrayBuffer());
}
