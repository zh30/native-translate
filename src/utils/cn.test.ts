import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn utility', () => {
  it('merges class names correctly', () => {
    expect(cn('c1', 'c2')).toBe('c1 c2');
  });

  it('handles conditional classes', () => {
    expect(cn('c1', true && 'c2', false && 'c3')).toBe('c1 c2');
  });

  it('merges tailwind classes using tailwind-merge', () => {
    // p-4 overrides p-2 in tailwind-merge
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('handles arrays and objects', () => {
    expect(cn('c1', ['c2', 'c3'], { c4: true, c5: false })).toBe('c1 c2 c3 c4');
  });
});
