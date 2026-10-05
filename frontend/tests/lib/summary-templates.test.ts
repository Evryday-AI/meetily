import { describe, expect, test } from 'bun:test';
import { normalizeTemplate, serializeTemplate, moveTemplateSection } from '../../src/lib/summary-templates';

const valid = () => ({ name: ' Notes ', description: ' Outcomes ', sections: [
  { title: ' Summary ', instruction: ' Explain outcomes ', format: 'paragraph' as const, item_format: '| Owner | Task |' },
  { title: 'Actions', instruction: 'List commitments', format: 'list' as const },
] });

describe('summary template editing', () => {
  test('trims required values while preserving optional list formatting and the draft', () => {
    const draft = valid();
    const clean = normalizeTemplate(draft);
    expect(clean.name).toBe('Notes');
    expect(clean.sections[0].instruction).toBe('Explain outcomes');
    expect(clean.sections[0].item_format).toBe('| Owner | Task |');
    expect(draft.name).toBe(' Notes ');
    expect(JSON.parse(serializeTemplate(draft))).toEqual(clean);
  });

  test('rejects every blank required field and empty sections', () => {
    for (const field of ['name', 'description'] as const) {
      expect(() => normalizeTemplate({ ...valid(), [field]: ' \n ' })).toThrow();
    }
    for (const field of ['title', 'instruction', 'format'] as const) {
      const draft = valid();
      Object.assign(draft.sections[0], { [field]: ' \t ' });
      expect(() => normalizeTemplate(draft)).toThrow();
    }
    expect(() => normalizeTemplate({ ...valid(), sections: [] })).toThrow();
  });

  test('rejects unsupported formats and payloads over 64 KiB of UTF-8', () => {
    const draft = valid();
    Object.assign(draft.sections[0], { format: 'table' });
    expect(() => normalizeTemplate(draft)).toThrow();
    expect(() => serializeTemplate({ ...valid(), description: 'é'.repeat(32768) })).toThrow('64 KiB');
  });

  test('reorders sections without losing their instructions or changing the source', () => {
    const draft = valid();
    const moved = moveTemplateSection(draft, 1, -1);
    expect(moved.sections.map(section => section.title)).toEqual(['Actions', ' Summary ']);
    expect(moved.sections[0].instruction).toBe('List commitments');
    expect(draft.sections[0].title).toBe(' Summary ');
    expect(moveTemplateSection(draft, 0, -1)).toEqual(draft);
  });
});
