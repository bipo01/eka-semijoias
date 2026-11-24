import { describe, expect, it } from 'vitest';
import { isInstagramHandle, normalizeInstagram } from './instagram';

describe('normalizeInstagram', () => {
  it.each([
    ['js_bispo1', 'js_bispo1'],
    ['@js_bispo1', 'js_bispo1'],
    ['  @js_bispo1  ', 'js_bispo1'],
    ['@@js_bispo1', 'js_bispo1'],
    ['@ js_bispo1', 'js_bispo1'],
    ['Js_Bispo1', 'js_bispo1'],
    ['@Ana.Semi', 'ana.semi'],
    ['instagram.com/ana.semi', 'ana.semi'],
    ['www.instagram.com/ana.semi/', 'ana.semi'],
    ['https://www.instagram.com/ana.semi/?hl=pt-br', 'ana.semi'],
    ['https://instagram.com/ana.semi?igsh=MTFxYWJj', 'ana.semi'],
    ['http://m.instagram.com/Ana.Semi#x', 'ana.semi'],
    ['https://www.instagram.com/_u/ana.semi', 'ana.semi'],
    ['instagr.am/ana.semi', 'ana.semi'],
    ['ana.semi/', 'ana.semi'],
    ['', ''],
    ['   ', ''],
    ['@', ''],
  ])('%j → %j', (typed, handle) => {
    expect(normalizeInstagram(typed)).toBe(handle);
    expect(isInstagramHandle(normalizeInstagram(typed))).toBe(true);
  });

  it('keeps what is not a handle, so the form can refuse it', () => {
    for (const typed of ['ana semi', 'ana-semi', 'não sei', 'a'.repeat(31), 'https://facebook.com/ana']) {
      expect(isInstagramHandle(normalizeInstagram(typed))).toBe(false);
    }
  });
});
