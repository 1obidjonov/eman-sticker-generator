import { describe, expect, it } from 'vitest';
import { DefaultQRFieldRenderer } from '../src/core/renderer-engine/qr-field-renderer.js';
import type { QRField } from '../src/shared/types/index.js';

const field: QRField = {
  id: 'qr',
  name: 'QR',
  type: 'qr',
  source: 'productUrl',
  rect: { x: 0, y: 0, width: 120, height: 120 },
  zIndex: 1,
  size: 120,
  margin: 1,
  whiteBackground: true,
  errorCorrectionLevel: 'M',
};

describe('DefaultQRFieldRenderer', () => {
  it('returns a base64 SVG data URI supported by browsers and Sharp', async () => {
    const dataUri = await new DefaultQRFieldRenderer().render(
      'https://example.com/product',
      field,
    );
    const encoded = dataUri.replace('data:image/svg+xml;base64,', '');
    const svg = Buffer.from(encoded, 'base64').toString('utf8');

    expect(dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(svg).toContain('<svg');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });
});
