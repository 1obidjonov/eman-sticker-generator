import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpRasterizer } from '../src/core/export/index.js';

const SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40">',
  '<rect width="80" height="40" fill="#0d9c5b"/>',
  '<circle cx="40" cy="20" r="10" fill="#ffffff" fill-opacity="0.5"/>',
  '</svg>',
].join('');

describe('SharpRasterizer', () => {
  it('creates a PNG at the requested integer scale', async () => {
    const result = await new SharpRasterizer().rasterize(SVG, {
      format: 'png',
      scale: 3,
      quality: 90,
    });
    const metadata = await sharp(result).metadata();

    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(240);
    expect(metadata.height).toBe(120);
  });

  it('creates an opaque JPG with the requested dimensions', async () => {
    const result = await new SharpRasterizer().rasterize(SVG, {
      format: 'jpg',
      scale: 2,
      quality: 85,
    });
    const metadata = await sharp(result).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(160);
    expect(metadata.height).toBe(80);
    expect(metadata.hasAlpha).toBe(false);
  });

  it('rejects unsupported raster settings', async () => {
    await expect(
      new SharpRasterizer().rasterize(SVG, {
        format: 'png',
        scale: 0,
        quality: 90,
      }),
    ).rejects.toThrow('Масштаб');
  });
});
