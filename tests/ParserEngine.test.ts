import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import {
  ParserEngine,
  ParserRegistry,
  normalizeProductUrl,
  type IProductParser,
} from '../src/core/parsers/index.js';

describe('normalizeProductUrl', () => {
  it('normalizes public HTTP links and removes fragments', () => {
    expect(
      normalizeProductUrl(' https://SHOP.example/product?q=1#reviews '),
    ).toBe('https://shop.example/product?q=1');
  });

  it('rejects unsafe schemes, credentials and private hosts', () => {
    expect(() => normalizeProductUrl('file:///etc/passwd')).toThrow('HTTP');
    expect(() =>
      normalizeProductUrl('https://user:pass@example.com'),
    ).toThrow('логином');
    expect(() => normalizeProductUrl('http://127.0.0.1/product')).toThrow(
      'внутренние',
    );
    expect(() => normalizeProductUrl('http://192.168.1.20/product')).toThrow(
      'внутренние',
    );
  });
});

describe('ParserEngine', () => {
  it('uses the registry plugin through the shared page provider', async () => {
    let pageLeases = 0;
    const plugin: IProductParser = {
      id: 'test',
      displayName: 'Test',
      description: 'Test parser',
      canParse: () => true,
      async parse(url) {
        return { url, name: 'Product', sourceParser: 'test' };
      },
    };
    const engine = new ParserEngine(
      new ParserRegistry().register(plugin),
      {
        async withPage(task) {
          pageLeases += 1;
          return task({
            url: () => 'https://example.com/product',
          } as Page);
        },
      },
    );

    const result = await engine.parse('https://example.com/product#details');

    expect(result.url).toBe('https://example.com/product');
    expect(result.name).toBe('Product');
    expect(pageLeases).toBe(1);
  });
});
