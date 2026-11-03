import { readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Readability rules that can be checked mechanically.
 *
 * These encode the style contract in `tem/style-guide.md` — the rules a human
 * reviewer would otherwise have to remember on every pull request. Each rule is
 * deliberately narrow: it flags a shape that is always worth a second look, not
 * a matter of taste.
 */
export type ReadabilityRule =
  | 'max-line-length'
  | 'nested-ternary'
  | 'else-after-return'
  | 'undocumented-export';

export interface ReadabilityFinding {
  /** Repository-relative path, forward slashes. */
  file: string;
  /** 1-based line number. */
  line: number;
  rule: ReadabilityRule;
  /** Human-readable specifics, e.g. "187 chars" or "function scopeMatches". */
  detail: string;
}

export type ReadabilityReport = Record<ReadabilityRule, ReadabilityFinding[]>;

/** Longest line a human can scan without horizontal scrolling on a split editor. */
export const MAX_LINE_LENGTH = 140;

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage', 'build']);

/** Every `.ts`/`.tsx` file under `directory`, sorted for stable output. */
export function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap(entry => {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) return [];
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(fullPath);
      return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [fullPath] : [];
    });
}

const emptyReport = (): ReadabilityReport => ({
  'max-line-length': [],
  'nested-ternary': [],
  'else-after-return': [],
  'undocumented-export': [],
});

const lineOf = (source: ts.SourceFile, node: ts.Node): number =>
  source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

/**
 * True when a statement cannot fall through to the next statement.
 *
 * Used by the `else-after-return` rule: an `else` is redundant only when the
 * `then` branch always exits, because otherwise the `else` is load-bearing.
 */
function alwaysExits(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) {
    const last = statement.statements[statement.statements.length - 1];
    return !!last && alwaysExits(last);
  }
  if (ts.isIfStatement(statement)) {
    return !!statement.elseStatement
      && alwaysExits(statement.thenStatement)
      && alwaysExits(statement.elseStatement);
  }
  return false;
}

/**
 * Declarations that carry executable behaviour and therefore deserve a doc block.
 *
 * Types and interfaces are deliberately excluded: their shape is the
 * documentation, and demanding a JSDoc line above every exported type produces
 * noise rather than clarity. The style guide asks for comments "on function
 * level", so that is exactly what this rule checks.
 */
function isDocumentableDeclaration(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node);
}

function isExportedDeclaration(node: ts.Node): boolean {
  if (!isDocumentableDeclaration(node)) return false;
  if (!ts.canHaveModifiers(node)) return false;
  return !!ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

const hasDocComment = (node: ts.Node): boolean => ts.getJSDocCommentsAndTags(node).length > 0;

const describeNode = (node: ts.Node): string => {
  const named = node as { name?: ts.Node };
  if (named.name && ts.isIdentifier(named.name)) return named.name.text;
  if (ts.isVariableStatement(node)) {
    const first = node.declarationList.declarations[0];
    if (first && ts.isIdentifier(first.name)) return first.name.text;
  }
  return ts.SyntaxKind[node.kind];
};

/**
 * Scan one file's source text for readability violations.
 *
 * Pure: takes text, returns findings. No filesystem access, so it is cheap to
 * unit-test against fixtures.
 */
export function scanSource(text: string, fileName: string, relativePath: string): ReadabilityReport {
  const report = emptyReport();
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  // Rule 1: line length. Pure text, so no AST walk needed.
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.length > MAX_LINE_LENGTH) {
      report['max-line-length'].push({
        file: relativePath,
        line: index + 1,
        rule: 'max-line-length',
        detail: `${line.length} chars`,
      });
    }
  });

  const visit = (node: ts.Node) => {
    // Rule 2: a ternary inside a ternary. The style guide asks for an `if`
    // block instead; nesting is where the `?` form stops being scannable.
    if (ts.isConditionalExpression(node)
      && (ts.isConditionalExpression(node.whenTrue) || ts.isConditionalExpression(node.whenFalse))) {
      report['nested-ternary'].push({
        file: relativePath,
        line: lineOf(source, node),
        rule: 'nested-ternary',
        detail: 'conditional expression nested inside another',
      });
    }

    // Rule 3: `else` after a branch that always exits. The `else` adds a level
    // of indentation for no reason; the style guide forbids it.
    if (ts.isIfStatement(node) && node.elseStatement && alwaysExits(node.thenStatement)) {
      report['else-after-return'].push({
        file: relativePath,
        line: lineOf(source, node),
        rule: 'else-after-return',
        detail: 'then-branch always exits, so the else is redundant',
      });
    }

    // Rule 4: an exported declaration with no JSDoc block above it.
    if (isExportedDeclaration(node) && !hasDocComment(node)) {
      report['undocumented-export'].push({
        file: relativePath,
        line: lineOf(source, node),
        rule: 'undocumented-export',
        detail: describeNode(node),
      });
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return report;
}

/** Merge per-file reports into one, preserving rule keys. */
export function mergeReports(reports: readonly ReadabilityReport[]): ReadabilityReport {
  const merged = emptyReport();
  for (const report of reports) {
    for (const rule of Object.keys(merged) as ReadabilityRule[]) {
      merged[rule].push(...report[rule]);
    }
  }
  return merged;
}

/** Group findings by file, so a failure message names the worst offenders first. */
export function worstFiles(findings: readonly ReadabilityFinding[], limit = 10): string[] {
  const counts = new Map<string, number>();
  for (const finding of findings) counts.set(finding.file, (counts.get(finding.file) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([file, count]) => `${file} (${count})`);
}

/** Format a finding as `path:line  rule  detail`, for assertion messages. */
export const formatFinding = (finding: ReadabilityFinding): string =>
  `${finding.file}:${finding.line}  ${finding.rule}  ${finding.detail}`;

/** Resolve a repository-relative path from an absolute one, with forward slashes. */
export const relativeTo = (repoRoot: string, file: string): string =>
  path.relative(repoRoot, file).replaceAll('\\', '/');
