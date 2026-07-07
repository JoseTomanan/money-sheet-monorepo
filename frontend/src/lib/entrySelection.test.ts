import { describe, it, expect } from 'vitest';
import { entryCountLabel, rowIntent } from './entrySelection';

describe('rowIntent', () => {
  it('select mode + selectable → toggle', () => {
    expect(rowIntent(true, true, false, false)).toBe('toggle');
  });

  it('select mode + not selectable → none (even if selectable would otherwise be editable)', () => {
    expect(rowIntent(true, false, false, false)).toBe('none');
  });

  it('not select mode + not pending + not deletePending → edit', () => {
    expect(rowIntent(false, true, false, false)).toBe('edit');
  });

  it('not select mode + pending → none', () => {
    expect(rowIntent(false, true, true, false)).toBe('none');
  });

  it('not select mode + deletePending → none', () => {
    expect(rowIntent(false, true, false, true)).toBe('none');
  });
});

describe('entryCountLabel', () => {
  it('singular for 1', () => {
    expect(entryCountLabel(1)).toBe('1 entry');
  });

  it('plural for 0', () => {
    expect(entryCountLabel(0)).toBe('0 entries');
  });

  it('plural for more than 1', () => {
    expect(entryCountLabel(3)).toBe('3 entries');
  });
});
