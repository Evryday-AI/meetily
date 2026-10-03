import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { DocumentBlock, MeetingDocument } from './model';

// PDF's built-in Helvetica is local and uses WinAnsi. Reject unsupported glyphs
// before rendering rather than silently replacing characters.
function assertPdfText(text: string) {
  const unsupported = Array.from(text).find(char => !/[\u0009\u000a\u000d\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac]/u.test(char));
  if (unsupported) throw new Error(`PDF's local font cannot represent ${JSON.stringify(unsupported)} (U+${unsupported.codePointAt(0)!.toString(16).toUpperCase()}). Choose Markdown or DOCX to preserve this text.`);
}
function validateBlocks(blocks: DocumentBlock[]) {
  blocks.forEach(block => {
    if (block.type === 'list') block.items.forEach(validateBlocks);
    else if (block.type === 'table') block.rows.flat().forEach(assertPdfText);
    else assertPdfText(block.text);
  });
}

export async function renderPdf(document: MeetingDocument): Promise<Uint8Array> {
  assertPdfText(document.title);
  validateBlocks(document.blocks);
  const file = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  file.setProperties({ title: document.title, author: 'Meetily' });
  const margin = 40;
  const width = file.internal.pageSize.getWidth() - margin * 2;
  const bottom = file.internal.pageSize.getHeight() - 48;
  let y = margin;
  const ensureSpace = (height: number) => { if (y + height > bottom) { file.addPage(); y = margin; } };
  const writeText = (text: string, size = 10, bold = false, indent = 0) => {
    file.setFont('helvetica', bold ? 'bold' : 'normal');
    file.setFontSize(size);
    file.setTextColor(32, 41, 56);
    const lines = file.splitTextToSize(text.replace(/\t/g, '    '), width - indent) as string[];
    for (const line of lines) {
      ensureSpace(size * 1.45);
      file.text(line, margin + indent, y + size);
      y += size * 1.45;
    }
    y += 7;
  };
  const renderBlocks = (blocks: DocumentBlock[], depth = 0) => {
    const indent = Math.min(depth * 16, width * 0.4);
    for (const block of blocks) {
      if (block.type === 'heading') {
        const size = block.level === 1 ? 21 : block.level === 2 ? 15 : 12;
        ensureSpace(size * 1.45 + 28);
        y += 8;
        writeText(block.text, size, true, indent);
      } else if (block.type === 'paragraph') writeText(block.text, 10, false, indent);
      else if (block.type === 'list') {
        block.items.forEach((item, index) => {
          const [first, ...rest] = item;
          const prefix = block.ordered ? `${block.start + index}.` : '•';
          if (first?.type === 'paragraph' || first?.type === 'heading') {
            writeText(`${prefix} ${first.text}`, 10, false, indent + 8);
            renderBlocks(rest, depth + 1);
          } else { writeText(prefix, 10, false, indent + 8); renderBlocks(item, depth + 1); }
        });
      } else {
        ensureSpace(40);
        const columns = Math.max(...block.rows.map(row => row.length));
        autoTable(file, {
          startY: y, head: [block.rows[0]], body: block.rows.slice(1),
          margin: { top: margin, right: margin, bottom: 48, left: margin + indent },
          theme: 'grid', showHead: 'everyPage', rowPageBreak: 'avoid',
          styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, overflow: 'linebreak', cellWidth: (width - indent) / columns, lineColor: [183, 189, 198], lineWidth: 0.5, textColor: [32, 41, 56] },
          headStyles: { fillColor: [238, 241, 245], textColor: [32, 41, 56], fontStyle: 'bold' },
        });
        y = (file as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      }
    }
  };
  renderBlocks(document.blocks);
  const pages = file.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    file.setPage(page);
    file.setFont('helvetica', 'normal'); file.setFontSize(8); file.setTextColor(105, 113, 128);
    file.text(`${page} / ${pages}`, file.internal.pageSize.getWidth() - margin, bottom + 26, { align: 'right' });
  }
  return new Uint8Array(file.output('arraybuffer'));
}
