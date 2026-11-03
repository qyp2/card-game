import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseConfigFileTextToJson } from 'typescript';
import { parseCardDefinition } from '@card-game/engine/rules/parse';
const parsed = parseConfigFileTextToJson('card_data.example.jsonc', readFileSync('packages/engine/src/library/card_data.example.jsonc', 'utf8'));
describe('documented authoring contracts', () => {
  it('contains valid JSON with comments', () => expect(parsed.error).toBeUndefined());
  it.each(Object.entries(parsed.config ?? {}))('compiles the documented %s definition', (id, value) => {
    expect(parseCardDefinition(value as Record<string, unknown>).id).toBe(id);
  });
});
