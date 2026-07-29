import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { finished } from 'node:stream/promises';
import type { ExportFormat } from '../../shared/ipc-contract.js';
import type { IRasterizer } from './IRasterizer.js';
import {
  sanitizeExportBaseName,
  type ExportedArtifact,
} from './ExportEngine.js';

export interface BatchSticker {
  name: string;
  svg: string;
}

export interface BatchExportOptions {
  stickers: BatchSticker[];
  formats: ExportFormat[];
  outputPath: string;
  scale?: number;
  quality?: number;
  onProgress?(completed: number, total: number): void;
}

export class BatchExportEngine {
  constructor(private readonly rasterizer: IRasterizer) {}

  async exportZip(options: BatchExportOptions): Promise<ExportedArtifact> {
    if (options.stickers.length === 0) {
      throw new Error('Нет готовых наклеек для экспорта.');
    }
    const formats = validateFormats(options.formats);
    const scale = options.scale ?? 1;
    const quality = options.quality ?? 90;
    validateSettings(scale, quality);

    await mkdir(dirname(options.outputPath), { recursive: true });
    const output = createWriteStream(options.outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const completion = finished(output, { cleanup: true });
    archive.pipe(output);

    const total = options.stickers.length * formats.length;
    const prefixWidth = Math.max(3, String(options.stickers.length).length);
    const names = new Map<string, number>();
    let completed = 0;

    try {
      for (const [index, sticker] of options.stickers.entries()) {
        const baseName = uniqueName(
          sanitizeExportBaseName(sticker.name),
          names,
        );
        const prefix = String(index + 1).padStart(prefixWidth, '0');

        for (const format of formats) {
          const data =
            format === 'svg'
              ? Buffer.from(sticker.svg, 'utf8')
              : await this.rasterizer.rasterize(sticker.svg, {
                  format,
                  scale,
                  quality,
                });
          archive.append(data, {
            name: `${prefix}-${baseName}.${format}`,
          });
          completed += 1;
          options.onProgress?.(completed, total);
        }
      }

      await Promise.all([archive.finalize(), completion]);
    } catch (error) {
      archive.abort();
      output.destroy();
      await rm(options.outputPath, { force: true });
      throw error;
    }

    return {
      outputPath: options.outputPath,
      bytes: (await stat(options.outputPath)).size,
      formats,
    };
  }
}

function validateFormats(formats: ExportFormat[]): ExportFormat[] {
  const allowed = new Set<ExportFormat>(['svg', 'png', 'jpg']);
  const unique = [...new Set(formats)];
  if (
    unique.length === 0 ||
    unique.some((format) => !allowed.has(format))
  ) {
    throw new Error('Выберите поддерживаемые форматы экспорта.');
  }
  return unique;
}

function validateSettings(scale: number, quality: number): void {
  if (!Number.isInteger(scale) || scale < 1 || scale > 4) {
    throw new Error('Масштаб экспорта должен быть от 1 до 4.');
  }
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error('Качество JPG должно быть от 1 до 100.');
  }
}

function uniqueName(value: string, names: Map<string, number>): string {
  const next = (names.get(value) ?? 0) + 1;
  names.set(value, next);
  return next === 1 ? value : `${value}-${next}`;
}
