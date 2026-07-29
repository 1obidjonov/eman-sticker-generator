import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSvgDimensions } from '../src/main/services/SvgMetadata.js';

describe('readSvgDimensions', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'sticker-svg-metadata-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('reads width and height without parsing designer content', async () => {
    const path = join(workspace, 'background.svg');
    await writeFile(
      path,
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000px" height="600"><path d="M0 0"/></svg>',
      'utf8',
    );

    await expect(readSvgDimensions(path)).resolves.toEqual({
      width: 1000,
      height: 600,
    });
  });

  it('falls back to viewBox dimensions', async () => {
    const path = join(workspace, 'background.svg');
    await writeFile(
      path,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"/>',
      'utf8',
    );

    await expect(readSvgDimensions(path)).resolves.toEqual({
      width: 1600,
      height: 900,
    });
  });

  it('rejects an SVG without usable dimensions', async () => {
    const path = join(workspace, 'background.svg');
    await writeFile(path, '<svg><path d="M0 0"/></svg>', 'utf8');

    await expect(readSvgDimensions(path)).rejects.toThrow(
      'Не удалось определить размер SVG',
    );
  });
});
