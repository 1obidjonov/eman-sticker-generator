import type { Page } from 'playwright-core';
import type { Product } from '../../../shared/types/index.js';
import {
  ProductParsingError,
  type IProductParser,
} from '../IProductParser.js';
import { PRODUCT_META_SELECTORS } from './schema-org.selectors.js';

interface ExtractedProduct {
  name: string;
  price?: string;
  currency?: string;
  sku?: string;
  brand?: string;
  image?: string;
  source: 'json-ld' | 'metadata';
}

export interface SchemaOrgProductParserOptions {
  navigationTimeoutMs?: number;
}

export class SchemaOrgProductParser implements IProductParser {
  readonly id = 'schema-org';
  readonly displayName = 'Schema.org / OpenGraph';
  readonly description =
    'Универсальный парсер товарных страниц с JSON-LD, microdata или OpenGraph.';
  private readonly navigationTimeoutMs: number;

  constructor(options: SchemaOrgProductParserOptions = {}) {
    const navigationTimeoutMs = options.navigationTimeoutMs ?? 35_000;
    if (
      !Number.isInteger(navigationTimeoutMs) ||
      navigationTimeoutMs < 1_000 ||
      navigationTimeoutMs > 120_000
    ) {
      throw new Error('Тайм-аут навигации должен быть от 1 до 120 секунд.');
    }
    this.navigationTimeoutMs = navigationTimeoutMs;
  }

  canParse(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async parse(url: string, page: Page): Promise<Product> {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.navigationTimeoutMs,
    });

    const extracted = await page.evaluate((selectors): ExtractedProduct => {
      type JsonRecord = Record<string, unknown>;

      const records: JsonRecord[] = [];
      for (const element of Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      )) {
        try {
          const parsed = JSON.parse(element.textContent ?? '') as unknown;
          collectRecords(parsed, records);
        } catch {
          // A broken third-party JSON-LD block should not block metadata fallback.
        }
      }

      const product = records.find((record) => hasType(record, 'Product'));
      if (product) {
        const offer = firstOffer(product.offers);
        const name = stringValue(product.name);
        if (name) {
          return {
            name,
            ...optional(
              'price',
              stringValue(
                offer?.price ??
                  offer?.lowPrice ??
                  offer?.highPrice ??
                  product.price,
              ),
            ),
            ...optional(
              'currency',
              stringValue(offer?.priceCurrency ?? product.priceCurrency),
            ),
            ...optional(
              'sku',
              stringValue(product.sku ?? product.productID ?? product.mpn),
            ),
            ...optional('brand', brandValue(product.brand)),
            ...optional('image', imageValue(product.image)),
            source: 'json-ld' as const,
          };
        }
      }

      const read = (candidates: readonly string[]): string | undefined => {
        for (const selector of candidates) {
          const element = document.querySelector(selector);
          const value =
            element?.getAttribute('content') ??
            element?.getAttribute('value') ??
            element?.textContent;
          const normalized = value?.replace(/\s+/g, ' ').trim();
          if (normalized) {
            return normalized;
          }
        }
        return undefined;
      };

      return {
        name: read(selectors.name) ?? document.title.trim(),
        ...optional('price', read(selectors.price)),
        ...optional('currency', read(selectors.currency)),
        ...optional('sku', read(selectors.sku)),
        source: 'metadata' as const,
      };

      function collectRecords(value: unknown, target: JsonRecord[]): void {
        if (Array.isArray(value)) {
          for (const item of value) {
            collectRecords(item, target);
          }
          return;
        }
        if (!value || typeof value !== 'object') {
          return;
        }
        const record = value as JsonRecord;
        target.push(record);
        if (Array.isArray(record['@graph'])) {
          collectRecords(record['@graph'], target);
        }
      }

      function hasType(record: JsonRecord, expected: string): boolean {
        const type = record['@type'];
        return Array.isArray(type)
          ? type.some((value) => matchesType(value, expected))
          : matchesType(type, expected);
      }

      function matchesType(value: unknown, expected: string): boolean {
        return (
          value === expected ||
          (typeof value === 'string' && value.endsWith(`/${expected}`))
        );
      }

      function firstOffer(value: unknown): JsonRecord | undefined {
        const candidate = Array.isArray(value) ? value[0] : value;
        return candidate && typeof candidate === 'object'
          ? (candidate as JsonRecord)
          : undefined;
      }

      function stringValue(value: unknown): string | undefined {
        if (typeof value === 'string' || typeof value === 'number') {
          const normalized = String(value).replace(/\s+/g, ' ').trim();
          return normalized || undefined;
        }
        return undefined;
      }

      function brandValue(value: unknown): string | undefined {
        if (value && typeof value === 'object') {
          return stringValue((value as JsonRecord).name);
        }
        return stringValue(value);
      }

      function imageValue(value: unknown): string | undefined {
        const candidate = Array.isArray(value) ? value[0] : value;
        if (candidate && typeof candidate === 'object') {
          return stringValue(
            (candidate as JsonRecord).url ??
              (candidate as JsonRecord).contentUrl,
          );
        }
        return stringValue(candidate);
      }

      function optional<K extends string>(
        key: K,
        value: string | undefined,
      ): { [P in K]?: string } {
        return value ? ({ [key]: value } as { [P in K]?: string }) : {};
      }
    }, PRODUCT_META_SELECTORS);

    if (!extracted.name) {
      throw new ProductParsingError(
        'На странице не найдено название товара.',
        this.id,
      );
    }

    const price = formatPrice(extracted.price, extracted.currency);
    const raw: Record<string, unknown> = {
      extractionSource: extracted.source,
      ...(extracted.brand ? { brand: extracted.brand } : {}),
      ...(extracted.image ? { image: extracted.image } : {}),
      ...(extracted.currency ? { currency: extracted.currency } : {}),
    };

    return {
      url,
      name: extracted.name,
      ...(price ? { price } : {}),
      ...(extracted.sku ? { sku: extracted.sku } : {}),
      sourceParser: this.id,
      raw,
    };
  }
}

function formatPrice(
  price: string | undefined,
  currency: string | undefined,
): string | undefined {
  if (!price) {
    return undefined;
  }
  if (!currency || price.toUpperCase().includes(currency.toUpperCase())) {
    return price;
  }
  return `${price} ${currency}`;
}
