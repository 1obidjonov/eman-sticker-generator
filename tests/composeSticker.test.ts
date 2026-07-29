import { describe, expect, it } from 'vitest';
import { composeSticker, type QRFieldRenderer } from '../src/index.js';
import {
  createTemplate,
  DeterministicTextMeasurementService,
  product,
} from './fixtures.js';

describe('composeSticker', () => {
  it('composes an opaque background, escaped text and generated fields', async () => {
    const qrRenderer: QRFieldRenderer = {
      async render() {
        return 'data:image/svg+xml;base64,TEST';
      },
    };

    const result = await composeSticker(createTemplate(), product, {
      backgroundResolver: {
        async resolve() {
          return 'data:image/svg+xml;base64,BACKGROUND';
        },
      },
      textMeasurementService: new DeterministicTextMeasurementService(),
      qrFieldRenderer: qrRenderer,
    });

    expect(result.svg).toContain('id="background-layer"');
    expect(result.svg).toContain('id="fields-layer"');
    expect(result.svg).toContain('Acrylic &lt;Tokyo&gt;');
    expect(result.svg).toContain('&amp; White');
    expect(result.svg).toContain('data:image/svg+xml;base64,TEST');
    expect(result.fields).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('warns and omits a QR field with an empty source', async () => {
    const template = createTemplate();
    const result = await composeSticker(
      template,
      { ...product, url: '' },
      {
        backgroundResolver: {
          async resolve() {
            return 'data:image/svg+xml;base64,BACKGROUND';
          },
        },
        textMeasurementService: new DeterministicTextMeasurementService(),
      },
    );

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ fieldId: 'qr', code: 'empty-value' }),
    );
    expect(result.svg).not.toContain('data-field-id="qr"');
  });
});
