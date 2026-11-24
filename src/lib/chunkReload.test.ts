import { beforeEach, describe, expect, it } from 'vitest';
import { shouldReloadAfterChunkError } from './chunkReload';

describe('shouldReloadAfterChunkError', () => {
  beforeEach(() => sessionStorage.clear());

  it('reloads once, then not again within a minute (no reload loop)', () => {
    expect(shouldReloadAfterChunkError(1_000_000)).toBe(true);
    expect(shouldReloadAfterChunkError(1_030_000)).toBe(false);
    expect(shouldReloadAfterChunkError(1_061_000)).toBe(true);
  });
});
