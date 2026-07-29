import { createServer, type Server } from 'node:http';
import type { Browser, Page } from 'playwright-core';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { SchemaOrgProductParser } from '../src/core/parsers/index.js';
import { launchApplicationBrowser } from '../src/main/services/BrowserFactory.js';

let browser: Browser;
let page: Page;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (request.url === '/metadata') {
      response.end(`
        <!doctype html>
        <title>Fallback product</title>
        <meta property="og:title" content="Фасад Tokyo White">
        <meta property="product:price:amount" content="1485000">
        <meta property="product:price:currency" content="UZS">
        <div itemprop="sku">AGT-TW-18</div>
      `);
      return;
    }
    response.end(`
      <!doctype html>
      <title>JSON-LD product</title>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Акрил AGT Tokyo White",
          "sku": "3075",
          "brand": {"@type": "Brand", "name": "AGT"},
          "image": ["https://cdn.example/tokyo.jpg"],
          "offers": {
            "@type": "Offer",
            "price": "1485000",
            "priceCurrency": "UZS"
          }
        }
      </script>
    `);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test HTTP server did not start.');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;

  browser = await launchApplicationBrowser();
  page = await browser.newPage();
}, 90_000);

afterAll(async () => {
  await page?.close();
  await browser?.close();
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
}, 90_000);

describe('SchemaOrgProductParser', () => {
  it('extracts product data from Schema.org JSON-LD', async () => {
    const result = await new SchemaOrgProductParser().parse(
      `${baseUrl}/json-ld`,
      page,
    );
    expect(result).toMatchObject({
      name: 'Акрил AGT Tokyo White',
      price: '1485000 UZS',
      sku: '3075',
      sourceParser: 'schema-org',
      raw: {
        extractionSource: 'json-ld',
        brand: 'AGT',
        image: 'https://cdn.example/tokyo.jpg',
      },
    });
  });

  it('falls back to OpenGraph and microdata metadata', async () => {
    const result = await new SchemaOrgProductParser().parse(
      `${baseUrl}/metadata`,
      page,
    );
    expect(result).toMatchObject({
      name: 'Фасад Tokyo White',
      price: '1485000 UZS',
      sku: 'AGT-TW-18',
      raw: { extractionSource: 'metadata' },
    });
  });
});
