export interface TemplateSection {
  title: string;
  instruction: string;
  format: 'paragraph' | 'list' | 'string';
  item_format?: string;
  example_item_format?: string;
}
export interface SummaryTemplate { name: string; description: string; sections: TemplateSection[] }
export interface TemplateInfo { id: string; name: string; description: string; is_custom: boolean }
export function normalizeTemplate(template: SummaryTemplate): SummaryTemplate {
  const required = (value: string, label: string) => {
    const trimmed = value.trim();
    if (!trimmed) throw new Error(`${label} is required.`);
    return trimmed;
  };
  const name = required(template.name, 'Template name');
  const description = required(template.description, 'Description');
  if (!template.sections.length) throw new Error('Add at least one section.');
  const sections = template.sections.map((section, index) => {
    const title = required(section.title, `Section ${index + 1} title`);
    const instruction = required(section.instruction, `Section ${index + 1} instruction`);
    const format = required(section.format, `Section ${index + 1} format`);
    if (!['paragraph', 'list', 'string'].includes(format)) throw new Error(`Section ${index + 1} has an unsupported format.`);
    return { ...section, title, instruction, format: format as TemplateSection['format'] };
  });
  return { name, description, sections };
}
export function serializeTemplate(template: SummaryTemplate): string {
  const json = JSON.stringify(normalizeTemplate(template));
  if (new TextEncoder().encode(json).length > 64 * 1024) throw new Error('Template exceeds 64 KiB. Shorten the text before saving.');
  return json;
}
export function moveTemplateSection(template: SummaryTemplate, index: number, direction: -1 | 1): SummaryTemplate {
  const target = index + direction;
  if (index < 0 || index >= template.sections.length || target < 0 || target >= template.sections.length) return template;
  const sections = [...template.sections];
  [sections[index], sections[target]] = [sections[target], sections[index]];
  return { ...template, sections };
}
