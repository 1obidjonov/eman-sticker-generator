import sharp from 'sharp';
import type {
  IRasterizer,
  RasterizeOptions,
} from './IRasterizer.js';

const BASE_SVG_DENSITY = 72;

export class SharpRasterizer implements IRasterizer {
  async rasterize(
    svg: string,
    options: RasterizeOptions,
  ): Promise<Buffer> {
    assertRasterizeOptions(options);

    const image = sharp(Buffer.from(svg), {
      density: BASE_SVG_DENSITY * options.scale,
      failOn: 'error',
      limitInputPixels: 268_402_689,
    });

    if (options.format === 'png') {
      return image.png({ compressionLevel: 9 }).toBuffer();
    }

    return image
      .flatten({ background: '#ffffff' })
      .jpeg({
        quality: options.quality,
        chromaSubsampling: '4:4:4',
        mozjpeg: true,
      })
      .toBuffer();
  }
}

function assertRasterizeOptions(options: RasterizeOptions): void {
  if (options.format !== 'png' && options.format !== 'jpg') {
    throw new Error('Sharp поддерживает растеризацию только в PNG и JPG.');
  }
  if (!Number.isInteger(options.scale) || options.scale < 1 || options.scale > 4) {
    throw new Error('Масштаб растра должен быть целым числом от 1 до 4.');
  }
  if (
    !Number.isInteger(options.quality) ||
    options.quality < 1 ||
    options.quality > 100
  ) {
    throw new Error('Качество JPG должно быть целым числом от 1 до 100.');
  }
}
