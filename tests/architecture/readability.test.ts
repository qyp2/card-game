import { describe, expect, it } from 'vitest';
import {
  formatFinding,
  MAX_LINE_LENGTH,
  mergeReports,
  relativeTo,
  scanSource,
  sourceFiles,
  worstFiles,
  type ReadabilityReport,
  type ReadabilityRule,
} from './readability';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Ratchet budgets.
 *
 * These are the CURRENT violation counts, frozen so that new code cannot add
 * more. Lower a number when you pay debt down; never raise one. A raise means
 * the rule was just weakened, which is the failure mode this file exists to
 * prevent.
 *
 * To regenerate: set a budget to 0 and read the actual count from the failure
 * message (`rule: N findings, budget 0`).
 *
 * Re-baselined once, on 2026-11-03, when `main` was merged into
 * `platform/foundation`. That branch added 36 engine files that had never been
 * through a readability pass, so `max-line-length` rose from 264 to 380. The
 * raise is new code, not a weakened rule: `nested-ternary` and
 * `undocumented-export` were paid back to their original budgets in the same
 * merge, and the remaining long lines are confined to the new files listed in
 * `docs/readability-gate.md`. Paying that debt down is tracked separately.
 *
 * Lowered on 2026-11-04 after `platform/foundation` was merged into `main` and
 * the branch's own formatting pass landed: 380 -> 221 long lines, 46 -> 41
 * nested ternaries, 33 -> 20 undocumented exports. `else-after-return` stays at
 * zero. Every number here is measured, never assumed.
 */
const BUDGET: Record<ReadabilityRule, number> = {
  'max-line-length': 221,
  'nested-ternary': 41,
  'else-after-return': 0,
  'undocumented-export': 20,
};

const repoRoot = process.cwd();

/** Scan every source file under the given roots and merge the findings. */
function scanRoots(roots: readonly string[]): ReadabilityReport {
  const reports = roots
    .flatMap(root => sourceFiles(path.resolve(repoRoot, root)))
    .map(file => scanSource(readFileSync(file, 'utf8'), file, relativeTo(repoRoot, file)));
  return mergeReports(reports);
}

const engineReport = scanRoots(['packages/engine/src']);

describe('readability rules', () => {
  for (const rule of Object.keys(BUDGET) as ReadabilityRule[]) {
    it(`does not exceed the ${rule} budget`, () => {
      const findings = engineReport[rule];
      const budget = BUDGET[rule];
      const message = findings.length > budget
        ? [
          `${rule}: ${findings.length} findings, budget ${budget} (+${findings.length - budget}).`,
          `Worst files: ${worstFiles(findings).join(', ')}`,
          'First findings:',
          ...findings.slice(0, 10).map(finding => `  ${formatFinding(finding)}`),
        ].join('\n')
        : '';
      expect(findings.length, message).toBeLessThanOrEqual(budget);
    });
  }
});

describe('readability scanner', () => {
  const scan = (text: string) => scanSource(text, 'fixture.ts', 'fixture.ts');

  it('flags a line longer than the limit', () => {
    const long = `const value = '${'x'.repeat(MAX_LINE_LENGTH)}';`;
    expect(scan(long)['max-line-length']).toHaveLength(1);
    expect(scan(long)['max-line-length'][0].detail).toMatch(/\d+ chars/);
  });

  it('accepts a line exactly at the limit', () => {
    const prefix = "const value = '";
    const suffix = "';";
    const exact = `${prefix}${'x'.repeat(MAX_LINE_LENGTH - prefix.length - suffix.length)}${suffix}`;
    expect(exact).toHaveLength(MAX_LINE_LENGTH);
    expect(scan(exact)['max-line-length']).toHaveLength(0);
  });

  it('flags a ternary nested inside a ternary', () => {
    const nested = 'const label = a ? b : c ? d : e;';
    expect(scan(nested)['nested-ternary']).toHaveLength(1);
  });

  it('accepts a single ternary', () => {
    expect(scan('const label = a ? b : c;')['nested-ternary']).toHaveLength(0);
  });

  it('flags else after a return', () => {
    const source = 'function f(x: number) { if (x) { return 1; } else { return 2; } }';
    expect(scan(source)['else-after-return']).toHaveLength(1);
  });

  it('accepts else when the then-branch can fall through', () => {
    const source = 'function f(x: number) { if (x) { log(x); } else { log(0); } }';
    expect(scan(source)['else-after-return']).toHaveLength(0);
  });

  it('flags an exported function with no doc comment', () => {
    expect(scan('export function f() { return 1; }')['undocumented-export']).toHaveLength(1);
  });

  it('accepts an exported function with a doc comment', () => {
    expect(scan('/** Does a thing. */\nexport function f() { return 1; }')['undocumented-export'])
      .toHaveLength(0);
  });

  it('ignores non-exported declarations', () => {
    expect(scan('function f() { return 1; }')['undocumented-export']).toHaveLength(0);
  });

  it('reports 1-based line numbers', () => {
    const source = 'const a = 1;\nconst b = a ? 1 : a ? 2 : 3;';
    expect(scan(source)['nested-ternary'][0].line).toBe(2);
  });
});
