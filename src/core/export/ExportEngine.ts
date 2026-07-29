import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExportFormat } from '../../shared/ipc-contract.js';
import type { IRasterizer } from './IRasterizer.js';

const ALLOWED_FORMATS = new Set<ExportFormat>(['svg', 'png', 'jpg']);

export interface ExportFileOptions {
  svg: string;
  outputPath: string;
  format: ExportFormat;
  scale?: number;
  quality?: number;
}

export interface ExportZipOptions {
  svg: string;
  outputPath: string;
  baseName: string;
  formats: ExportFormat[];
  scale?: number;
  quality?: number;
}

export interface ExportedArtifact {
  outputPath: string;
  bytes: number;
  formats: ExportFormat[];
}

export class ExportEngine {
  constructor(private readonly rasterizer: IRasterizer) {}

  async exportFile(options: ExportFileOptions): Promise<ExportedArtifact> {
    assertSvg(options.svg);
    assertExportFormat(options.format);
    const settings = normalizeSettings(options.scale, options.quality);
    const data = await this.renderFormat(
      options.svg,
      options.format,
      settings.scale,
      settings.quality,
    );

    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, data);

    return {
      outputPath: options.outputPath,
      bytes: data.byteLength,
      formats: [options.format],
    };
  }

  async exportZip(options: ExportZipOptions): Promise<ExportedArtifact> {
    assertSvg(options.svg);
    const formats = uniqueFormats(options.formats);
    if (formats.length === 0) {
      throw new Error('Выберите хотя бы один формат экспорта.');
    }

    const settings = normalizeSettings(options.scale, options.quality);
    const baseName = sanitizeExportBaseName(options.baseName);
    const entries = await Promise.all(
      formats.map(async (format) => ({
        format,
        data: await this.renderFormat(
          options.svg,
          format,
          settings.scale,
          settings.quality,
        ),
      })),
    );

    await mkdir(dirname(options.outputPath), { recursive: true });

    try {
      await writeArchive(
        options.outputPath,
        entries.map((entry) => ({
          name: `${baseName}.${entry.format}`,
          data: entry.data,
        })),
      );
    } catch (error) {
      await rm(options.outputPath, { force: true });
      throw error;
    }

    return {
      outputPath: options.outputPath,
      bytes: (await stat(options.outputPath)).size,
      formats,
    };
  }

  private renderFormat(
    svg: string,
    format: ExportFormat,
    scale: number,
    quality: number,
  ): Promise<Buffer> {
    if (format === 'svg') {
      return Promise.resolve(Buffer.from(svg, 'utf8'));
    }
    return this.rasterizer.rasterize(svg, { format, scale, quality });
  }
}

export function sanitizeExportBaseName(value: string): string {
  const sanitized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.\s-]+$/g, '')
    .trim()
    .slice(0, 120);
  return sanitized || 'sticker';
}

function assertSvg(svg: string): void {
  if (
    typeof svg !== 'string' ||
    svg.length === 0 ||
    !/<svg(?:\s|>)/i.test(svg)
  ) {
    throw new Error('Для экспорта требуется корректный SVG-документ.');
  }
}

function normalizeSettings(
  scale = 1,
  quality = 90,
): { scale: number; quality: number } {
  if (!Number.isInteger(scale) || scale < 1 || scale > 4) {
    throw new Error('Масштаб экспорта должен быть целым числом от 1 до 4.');
  }
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error('Качество JPG должно быть целым числом от 1 до 100.');
  }
  return { scale, quality };
}

function uniqueFormats(formats: ExportFormat[]): ExportFormat[] {
  for (const format of formats) {
    assertExportFormat(format);
  }
  return [...new Set(formats)];
}

function assertExportFormat(format: ExportFormat): void {
  if (!ALLOWED_FORMATS.has(format)) {
    throw new Error('Неподдерживаемый формат экспорта.');
  }
}

interface ArchiveEntry {
  name: string;
  data: Buffer;
}

async function writeArchive(
  outputPath: string,
  entries: ArchiveEntry[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    let settled = false;

    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    output.once('close', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    output.once('error', fail);
    archive.once('error', fail);
    archive.pipe(output);

    for (const entry of entries) {
      archive.append(entry.data, { name: entry.name });
    }

    void archive.finalize().catch(fail);
  });
}
