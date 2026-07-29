import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TemplateService } from '../src/main/services/TemplateService.js';
import { createTemplate } from './fixtures.js';

describe('TemplateService', () => {
  let workspace: string;
  let templatesRoot: string;
  let sourcePath: string;
  let service: TemplateService;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'sticker-template-service-'));
    templatesRoot = join(workspace, 'templates');
    sourcePath = join(workspace, 'source.svg');
    await writeFile(
      sourcePath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"/>',
      'utf8',
    );
    service = new TemplateService(templatesRoot);
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('creates, lists and returns embedded background data', async () => {
    const template = await service.create({
      name: '  Showroom   price tag ',
      sourcePath,
      format: 'svg',
      width: 400,
      height: 300,
      thumbnailPng: new Uint8Array([137, 80, 78, 71]),
    });

    expect(template.name).toBe('Showroom price tag');
    expect(await service.list()).toEqual([
      expect.objectContaining({
        id: template.id,
        name: 'Showroom price tag',
        fieldCount: 0,
      }),
    ]);

    const background = await service.getBackground(template.id);
    expect(background.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(background.width).toBe(400);

    const thumbnail = await service.getThumbnail(template.id);
    expect(thumbnail.dataUrl).toBe('data:image/png;base64,iVBORw==');
  });

  it('saves fields while protecting immutable background metadata', async () => {
    const template = await service.create({
      name: 'Template',
      sourcePath,
      format: 'svg',
      width: 400,
      height: 300,
    });
    const field = createTemplate().fields[0]!;
    const saved = await service.save({
      ...template,
      background: {
        format: 'png',
        filePath: 'background.png',
        width: 1,
        height: 1,
      },
      fields: [field],
    });

    expect(saved.fields).toHaveLength(1);
    expect(saved.background).toEqual(template.background);
    expect(saved.updatedAt >= template.updatedAt).toBe(true);

    const stored = JSON.parse(
      await readFile(
        join(templatesRoot, template.id, 'template.json'),
        'utf8',
      ),
    ) as { background: unknown };
    expect(stored.background).toEqual(template.background);
  });

  it('renames and deletes a template', async () => {
    const template = await service.create({
      name: 'Old name',
      sourcePath,
      format: 'svg',
      width: 400,
      height: 300,
    });

    const renamed = await service.rename(template.id, 'New name');
    expect(renamed.name).toBe('New name');

    await service.delete(template.id);
    expect(await service.list()).toEqual([]);
  });

  it('rejects path traversal in ids', async () => {
    await expect(service.open('../outside')).rejects.toThrow(
      'Invalid template id',
    );
  });
});
