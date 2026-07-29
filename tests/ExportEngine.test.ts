import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ExportEngine,
  sanitizeExportBaseName,
  SharpRasterizer,
} from '../src/core/export/index.js';

const SVG = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60">',
  '<rect width="120" height="60" rx="8" fill="#f2f6f4"/>',
  '<text x="12" y="35" font-family="Arial" font-size="18">Sticker</text>',
  '</svg>',
].join('');

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe('ExportEngine', () => {
  it('writes the composed SVG without changing it', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'sticker.svg');
    const result = await engine().exportFile({
      svg: SVG,
      outputPath,
      format: 'svg',
    });

    expect(await readFile(outputPath, 'utf8')).toBe(SVG);
    expect(result.formats).toEqual(['svg']);
    expect(result.bytes).toBe(Buffer.byteLength(SVG));
  });

  it('exports a PNG through the rasterizer', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'sticker.png');
    const result = await engine().exportFile({
      svg: SVG,
      outputPath,
      format: 'png',
      scale: 2,
      quality: 90,
    });
    const metadata = await sharp(outputPath).metadata();

    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(240);
    expect(metadata.height).toBe(120);
    expect(result.bytes).toBeGreaterThan(100);
  });

  it('packs unique selected formats into a ZIP archive', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'stickers.zip');
    const result = await engine().exportZip({
      svg: SVG,
      outputPath,
      baseName: 'Карточка / Tokyo',
      formats: ['svg', 'png', 'jpg', 'png'],
      scale: 1,
      quality: 80,
    });
    const archive = await readFile(outputPath);

    expect(archive.subarray(0, 2).toString()).toBe('PK');
    expect(archive.includes(Buffer.from('Карточка - Tokyo.svg'))).toBe(true);
    expect(archive.includes(Buffer.from('Карточка - Tokyo.png'))).toBe(true);
    expect(archive.includes(Buffer.from('Карточка - Tokyo.jpg'))).toBe(true);
    expect(result.formats).toEqual(['svg', 'png', 'jpg']);
    expect(result.bytes).toBe(archive.byteLength);
  });

  it('rejects an invalid composition before writing', async () => {
    const directory = await temporaryDirectory();
    await expect(
      engine().exportFile({
        svg: 'not an svg',
        outputPath: join(directory, 'bad.svg'),
        format: 'svg',
      }),
    ).rejects.toThrow('SVG');
  });
});

describe('sanitizeExportBaseName', () => {
  it('removes unsafe path characters and keeps a useful name', () => {
    expect(sanitizeExportBaseName('  Цена: Tokyo / 2026?.  ')).toBe(
      'Цена- Tokyo - 2026',
    );
    expect(sanitizeExportBaseName('...')).toBe('sticker');
  });
});

function engine(): ExportEngine {
  return new ExportEngine(new SharpRasterizer());
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sticker-export-'));
  temporaryDirectories.push(directory);
  return directory;
}
