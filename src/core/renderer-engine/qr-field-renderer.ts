import QRCode from 'qrcode';
import type { QRField } from '../../shared/types/index.js';
import type { QRFieldRenderer } from './types.js';

export class DefaultQRFieldRenderer implements QRFieldRenderer {
  async render(value: string, field: QRField): Promise<string> {
    const size = Math.min(
      field.size,
      field.rect.width,
      field.rect.height,
    );
    const svg = await QRCode.toString(value, {
      type: 'svg',
      width: size,
      margin: field.margin,
      errorCorrectionLevel: field.errorCorrectionLevel,
      color: {
        dark: '#000000ff',
        light: field.whiteBackground ? '#ffffffff' : '#00000000',
      },
    });

    return `data:image/svg+xml;base64,${encodeBase64(svg)}`;
  }
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
