export interface Product {
  url: string;
  name: string;
  price?: string;
  sku?: string;
  sourceParser: string;
  raw?: Record<string, unknown>;
}
