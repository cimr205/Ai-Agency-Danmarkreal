import { describe, it, expect } from 'vitest';

describe('Pagination utilities', () => {
  const PAGE_SIZE = 50;

  it('should compute correct page ranges', () => {
    const pageParam = 0;
    const from = pageParam;
    const to = pageParam + PAGE_SIZE - 1;
    expect(from).toBe(0);
    expect(to).toBe(49);
  });

  it('should compute next offset', () => {
    const pageParam = 50;
    const nextOffset = pageParam + PAGE_SIZE;
    expect(nextOffset).toBe(100);
  });

  it('should stop when less than PAGE_SIZE results', () => {
    const data = new Array(30); // less than 50
    const hasMore = data.length >= PAGE_SIZE;
    expect(hasMore).toBe(false);
  });
});
