import { describe, expect, it } from 'vitest';
import type {
  IProductParser,
} from '../src/core/parsers/index.js';
import { ParserRegistry } from '../src/core/parsers/index.js';

describe('ParserRegistry', () => {
  it('resolves the first matching parser and exposes descriptors', () => {
    const first = parser('first', (url) => url.includes('first.example'));
    const fallback = parser('fallback', () => true);
    const registry = new ParserRegistry()
      .register(first)
      .register(fallback);

    expect(registry.resolve('https://first.example/product')).toBe(first);
    expect(registry.resolve('https://other.example/product')).toBe(fallback);
    expect(registry.list()).toEqual([
      {
        id: 'first',
        displayName: 'Parser first',
        description: 'Description first',
      },
      {
        id: 'fallback',
        displayName: 'Parser fallback',
        description: 'Description fallback',
      },
    ]);
  });

  it('returns null when no plugin supports the URL', () => {
    const registry = new ParserRegistry().register(
      parser('limited', () => false),
    );
    expect(registry.resolve('https://example.com')).toBeNull();
  });

  it('rejects duplicate plugin ids', () => {
    const registry = new ParserRegistry().register(parser('same', () => true));
    expect(() => registry.register(parser('same', () => true))).toThrow(
      'уже зарегистрирован',
    );
  });
});

function parser(
  id: string,
  canParse: (url: string) => boolean,
): IProductParser {
  return {
    id,
    displayName: `Parser ${id}`,
    description: `Description ${id}`,
    canParse,
    async parse(url) {
      return {
        url,
        name: id,
        sourceParser: id,
      };
    },
  };
}
