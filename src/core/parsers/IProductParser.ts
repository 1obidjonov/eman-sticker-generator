import type { Page } from 'playwright-core';
import type { Product } from '../../shared/types/index.js';

export interface ParserDescriptor {
  id: string;
  displayName: string;
  description: string;
}

export interface IProductParser {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  canParse(url: string): boolean;
  parse(url: string, page: Page): Promise<Product>;
}

export class ProductParsingError extends Error {
  constructor(
    message: string,
    readonly parserId: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProductParsingError';
  }
}
