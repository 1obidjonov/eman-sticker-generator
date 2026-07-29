export const PRODUCT_META_SELECTORS = {
  name: [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    '[itemprop="name"]',
    'h1',
  ],
  price: [
    'meta[property="product:price:amount"]',
    '[itemprop="price"]',
  ],
  currency: [
    'meta[property="product:price:currency"]',
    '[itemprop="priceCurrency"]',
  ],
  sku: [
    '[itemprop="sku"]',
    'meta[property="product:retailer_item_id"]',
  ],
} as const;
