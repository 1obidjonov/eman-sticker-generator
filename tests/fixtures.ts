import type {
  Product,
  Template,
  TextMeasurementService,
} from '../src/index.js';

export function createTemplate(): Template {
  return {
    id: 'template-test',
    name: 'Test template',
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    background: {
      format: 'svg',
      filePath: 'background.svg',
      width: 400,
      height: 300,
    },
    fields: [
      {
        id: 'name',
        name: 'Product name',
        type: 'text',
        source: 'productName',
        rect: { x: 20, y: 20, width: 260, height: 80 },
        zIndex: 1,
        font: {
          family: 'Arial',
          size: 30,
          minSize: 12,
          maxSize: 30,
          bold: true,
          italic: false,
        },
        align: 'left',
        lineHeight: 1.1,
        color: '#112233',
        wrap: true,
        autoShrink: true,
        ellipsis: true,
      },
      {
        id: 'qr',
        name: 'QR',
        type: 'qr',
        source: 'productUrl',
        rect: { x: 300, y: 150, width: 80, height: 80 },
        zIndex: 2,
        size: 80,
        margin: 1,
        whiteBackground: true,
        errorCorrectionLevel: 'M',
      },
    ],
  };
}

export const product: Product = {
  url: 'https://example.com/a?x=1&y=2',
  name: 'Acrylic <Tokyo> & White',
  price: '100',
  sku: 'SKU-1',
  sourceParser: 'test',
};

export class DeterministicTextMeasurementService
  implements TextMeasurementService
{
  async measure(
    text: string,
    font: { size: number },
  ): Promise<{ width: number; height: number }> {
    return {
      width: Array.from(text).length * font.size * 0.6,
      height: font.size,
    };
  }
}
