import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeTemplate } from '../../src/lib/summary-templates';

test('six embedded starter presets validate and preserve stable IDs', () => {
  const directory = join(import.meta.dir, '../../src-tauri/templates');
  const registry = readFileSync(join(directory, '../src/summary/templates/defaults.rs'), 'utf8');
  const ids = ['daily_standup', 'standard_meeting', 'retrospective', 'client_call', 'interview', 'project_planning'];
  for (const id of ids) {
    expect(registry).toContain(`("${id}",`);
    const path = join(directory, `${id}.json`);
    expect(existsSync(path)).toBe(true);
    const preset = JSON.parse(readFileSync(path, 'utf8'));
    expect(normalizeTemplate(preset).sections.length).toBeGreaterThan(0);
  }
  expect(registry.match(/include_str!\(/g)).toHaveLength(6);
});
