import { describe, expect, it } from 'vitest';
import {
  checkBudget,
  collectInitialChunks,
  ENTRY_GZIP_BUDGET_KB,
  resolveBudgetKb,
} from '../../vite.config';

describe('resolveBudgetKb', () => {
  it.each([
    [undefined, ENTRY_GZIP_BUDGET_KB],
    ['', ENTRY_GZIP_BUDGET_KB],
    ['abc', ENTRY_GZIP_BUDGET_KB],
    ['0', ENTRY_GZIP_BUDGET_KB],
    ['-5', ENTRY_GZIP_BUDGET_KB],
    ['100', 100],
    ['12.5', 12.5],
    ['9999', ENTRY_GZIP_BUDGET_KB],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveBudgetKb(input)).toBe(expected);
  });
});

describe('collectInitialChunks', () => {
  it('follows static imports transitively and counts shared chunks once', () => {
    const graph: Record<string, string[]> = {
      'entry.js': ['a.js', 'shared.js'],
      'a.js': ['b.js', 'shared.js'],
      'b.js': ['entry.js'],
      'shared.js': [],
      'lazy.js': ['shared.js'],
    };
    const chunks = collectInitialChunks('entry.js', (name) => graph[name] ?? []);
    expect(chunks.sort()).toEqual(['a.js', 'b.js', 'entry.js', 'shared.js']);
  });
});

describe('checkBudget', () => {
  it('passes at or under the budget', () => {
    expect(checkBudget('index.js', 450 * 1024, 450)).toBeNull();
    expect(checkBudget('index.js', 100, 450)).toBeNull();
  });

  it('fails over the budget with the size and file in the message', () => {
    const error = checkBudget('assets/index-abc.js', 451 * 1024, 450);
    expect(error).toContain('assets/index-abc.js');
    expect(error).toContain('451.0 kB');
    expect(error).toContain('450 kB budget');
  });
});
