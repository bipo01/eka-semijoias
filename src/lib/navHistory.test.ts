import { describe, expect, it } from 'vitest';
import { createNavHistory } from './navHistory';

const loc = (key: string, pathname: string, search = '') => ({ key, pathname, search });

describe('navHistory', () => {
  it('knows nothing behind a page opened directly', () => {
    const nav = createNavHistory(loc('default', '/produto/brinco'));
    expect(nav.backFrom('default')).toBeNull();
  });

  it('goes back one entry to the page the visitor came from, with its search', () => {
    const nav = createNavHistory(loc('default', '/catalogo'));
    nav.record('PUSH', loc('a', '/catalogo', '?acabamento=rose'));
    nav.record('PUSH', loc('b', '/produto/brinco'));
    expect(nav.backFrom('b')).toEqual({ steps: 1, pathname: '/catalogo', search: '?acabamento=rose' });
  });

  it('skips filter changes on the same page', () => {
    const nav = createNavHistory(loc('default', '/'));
    nav.record('PUSH', loc('a', '/catalogo/brincos'));
    nav.record('PUSH', loc('b', '/catalogo/brincos', '?acabamento=rose'));
    nav.record('PUSH', loc('c', '/catalogo/brincos', '?acabamento=rose&promo=1'));
    expect(nav.backFrom('c')).toEqual({ steps: 3, pathname: '/', search: '' });
  });

  it('a replaced entry keeps the entry behind it', () => {
    const nav = createNavHistory(loc('default', '/'));
    nav.record('PUSH', loc('a', '/produto/brinco'));
    nav.record('REPLACE', loc('b', '/produto/brinco', '?v=dourado'));
    expect(nav.backFrom('b')).toEqual({ steps: 1, pathname: '/', search: '' });
  });

  it('back/forward lands on entries already known', () => {
    const nav = createNavHistory(loc('default', '/'));
    nav.record('PUSH', loc('a', '/catalogo'));
    nav.record('PUSH', loc('b', '/produto/anel'));
    nav.record('POP', loc('a', '/catalogo'));
    expect(nav.backFrom('a')).toEqual({ steps: 1, pathname: '/', search: '' });
    nav.record('POP', loc('b', '/produto/anel'));
    expect(nav.backFrom('b')).toEqual({ steps: 1, pathname: '/catalogo', search: '' });
  });

  it('an entry from before a reload is unknown', () => {
    const nav = createNavHistory(loc('x', '/produto/anel'));
    nav.record('POP', loc('w', '/catalogo'));
    expect(nav.backFrom('w')).toBeNull();
    expect(nav.backFrom('x')).toBeNull();
  });

  it('ignores router updates that keep the same location', () => {
    const nav = createNavHistory(loc('default', '/'));
    nav.record('PUSH', loc('a', '/catalogo'));
    nav.record('PUSH', loc('a', '/catalogo'));
    expect(nav.backFrom('a')).toEqual({ steps: 1, pathname: '/', search: '' });
  });
});
