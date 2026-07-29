import type {
  PlaywrightPageProvider,
} from '../renderer-engine/PlaywrightTextMeasurementService.js';
import type { Product } from '../../shared/types/index.js';
import {
  ProductParsingError,
} from './IProductParser.js';
import type { ParserRegistry } from './ParserRegistry.js';

export interface ParserEngineOptions {
  allowPrivateHosts?: boolean;
}

export class ParserEngine {
  private readonly allowPrivateHosts: boolean;

  constructor(
    private readonly registry: ParserRegistry,
    private readonly pageProvider: PlaywrightPageProvider,
    options: ParserEngineOptions = {},
  ) {
    this.allowPrivateHosts = options.allowPrivateHosts ?? false;
  }

  async parse(rawUrl: string): Promise<Product> {
    const url = normalizeProductUrl(rawUrl, this.allowPrivateHosts);
    const parser = this.registry.resolve(url);
    if (!parser) {
      throw new ProductParsingError(
        'Для этой ссылки не найден подходящий парсер.',
        'registry',
      );
    }

    return this.pageProvider.withPage(async (page) => {
      try {
        const product = await parser.parse(url, page);
        normalizeProductUrl(page.url(), this.allowPrivateHosts);
        return product;
      } catch (error) {
        if (error instanceof ProductParsingError) {
          throw error;
        }
        throw new ProductParsingError(
          `Не удалось получить данные товара: ${toErrorMessage(error)}`,
          parser.id,
          { cause: error },
        );
      }
    });
  }
}

export function normalizeProductUrl(
  rawUrl: string,
  allowPrivateHosts = false,
): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Некорректная ссылка на товар.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Поддерживаются только HTTP и HTTPS-ссылки.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Ссылки со встроенными логином и паролем запрещены.');
  }
  if (!allowPrivateHosts && isPrivateHost(parsed.hostname)) {
    throw new Error('Локальные и внутренние адреса запрещены.');
  }

  parsed.hash = '';
  return parsed.toString();
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1'
  ) {
    return true;
  }

  const octets = normalized.split('.').map(Number);
  if (
    octets.length === 4 &&
    octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
  ) {
    const [first = 0, second = 0] = octets;
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  return (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'неизвестная ошибка';
}
