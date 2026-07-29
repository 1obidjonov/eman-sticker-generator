import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BatchExportEngine,
  SharpRasterizer,
} from '../src/core/export/index.js';

const temporaryDirectories: string[] = [];
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#0d9c5b"/></svg>';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe('BatchExportEngine', () => {
  it('streams multiple stickers and formats into one ZIP', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'batch.zip');
    const progress: Array<[number, number]> = [];

    const result = await new BatchExportEngine(
      new SharpRasterizer(),
    ).exportZip({
      outputPath,
      formats: ['svg', 'png'],
      scale: 2,
      stickers: [
        { name: 'Tokyo / White', svg: SVG },
        { name: 'Tokyo / White', svg: SVG },
      ],
      onProgress(completed, total) {
        progress.push([completed, total]);
      },
    });
    const archive = await readFile(outputPath);
    const endOfCentralDirectory = archive.lastIndexOf(
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    );

    expect(archive.subarray(0, 2).toString()).toBe('PK');
    expect(endOfCentralDirectory).toBeGreaterThan(0);
    expect(archive.readUInt16LE(endOfCentralDirectory + 10)).toBe(4);
    expect(archive.includes(Buffer.from('001-Tokyo - White.svg'))).toBe(true);
    expect(archive.includes(Buffer.from('002-Tokyo - White-2.png'))).toBe(
      true,
    );
    expect(progress.at(-1)).toEqual([4, 4]);
    expect(result.formats).toEqual(['svg', 'png']);
    expect(result.bytes).toBe(archive.byteLength);
  });

  it('rejects an empty batch', async () => {
    const directory = await temporaryDirectory();
    await expect(
      new BatchExportEngine(new SharpRasterizer()).exportZip({
        outputPath: join(directory, 'empty.zip'),
        formats: ['png'],
        stickers: [],
      }),
    ).rejects.toThrow('Нет готовых');
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sticker-batch-'));
  temporaryDirectories.push(directory);
  return directory;
}
