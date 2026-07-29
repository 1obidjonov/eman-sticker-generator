export type RasterFormat = 'png' | 'jpg';

export interface RasterizeOptions {
  format: RasterFormat;
  scale: number;
  quality: number;
}

export interface IRasterizer {
  rasterize(svg: string, options: RasterizeOptions): Promise<Buffer>;
}
