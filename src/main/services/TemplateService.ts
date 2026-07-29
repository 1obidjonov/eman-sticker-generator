import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import type {
  TemplateAssetData,
  TemplateSummary,
} from '../../shared/ipc-contract.js';
import type {
  BackgroundFormat,
  Template,
} from '../../shared/types/index.js';
import { assertValidTemplate } from '../../core/template/TemplateValidator.js';

export interface CreateStoredTemplateInput {
  name: string;
  sourcePath: string;
  format: BackgroundFormat;
  width: number;
  height: number;
  thumbnailPng?: Uint8Array;
}

export class TemplateService {
  constructor(private readonly templatesRoot: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.templatesRoot, { recursive: true });
  }

  async list(): Promise<TemplateSummary[]> {
    await this.initialize();
    const entries = await readdir(this.templatesRoot, { withFileTypes: true });
    const summaries = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry): Promise<TemplateSummary | null> => {
          try {
            return toSummary(await this.readTemplate(entry.name));
          } catch {
            return null;
          }
        }),
    );

    return summaries
      .filter((summary): summary is TemplateSummary => summary !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async create(input: CreateStoredTemplateInput): Promise<Template> {
    const name = normalizeName(input.name);
    if (input.width <= 0 || input.height <= 0) {
      throw new Error('Background dimensions must be positive.');
    }

    await stat(input.sourcePath);
    await this.initialize();

    const id = randomUUID();
    const directory = this.getTemplateDirectory(id);
    const backgroundFileName = `background.${input.format}`;
    const backgroundPath = join(directory, backgroundFileName);
    const now = new Date().toISOString();
    const template: Template = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      background: {
        format: input.format,
        filePath: backgroundFileName,
        width: input.width,
        height: input.height,
      },
      fields: [],
    };

    assertValidTemplate(template);
    await mkdir(directory);

    try {
      await copyFile(input.sourcePath, `${backgroundPath}.tmp`);
      await rename(`${backgroundPath}.tmp`, backgroundPath);
      await this.writeTemplate(template);

      if (input.thumbnailPng && input.thumbnailPng.byteLength > 0) {
        await writeFile(join(directory, 'thumbnail.png'), input.thumbnailPng);
      }

      return template;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async open(id: string): Promise<Template> {
    return this.readTemplate(id);
  }

  async save(candidate: Template): Promise<Template> {
    const existing = await this.readTemplate(candidate.id);
    const next: Template = {
      ...existing,
      name: normalizeName(candidate.name),
      fields: structuredClone(candidate.fields),
      updatedAt: new Date().toISOString(),
    };

    assertValidTemplate(next);
    await this.writeTemplate(next);
    return next;
  }

  async rename(id: string, name: string): Promise<Template> {
    const template = await this.readTemplate(id);
    return this.save({ ...template, name: normalizeName(name) });
  }

  async delete(id: string): Promise<void> {
    const directory = this.getTemplateDirectory(id);
    await stat(join(directory, 'template.json'));
    await rm(directory, { recursive: true });
  }

  async getBackground(id: string): Promise<TemplateAssetData> {
    const template = await this.readTemplate(id);
    const path = this.getAssetPath(id, template.background.filePath);
    const bytes = await readFile(path);
    return {
      dataUrl: toDataUrl(bytes, template.background.format),
      format: template.background.format,
      width: template.background.width,
      height: template.background.height,
    };
  }

  async getThumbnail(id: string): Promise<TemplateAssetData> {
    const template = await this.readTemplate(id);
    const thumbnailPath = join(this.getTemplateDirectory(id), 'thumbnail.png');

    try {
      const bytes = await readFile(thumbnailPath);
      return {
        dataUrl: toDataUrl(bytes, 'png'),
        format: 'png',
        width: template.background.width,
        height: template.background.height,
      };
    } catch {
      return this.getBackground(id);
    }
  }

  private async readTemplate(id: string): Promise<Template> {
    const directory = this.getTemplateDirectory(id);
    const contents = await readFile(join(directory, 'template.json'), 'utf8');
    const template = JSON.parse(contents) as Template;

    if (template.id !== id) {
      throw new Error('Template id does not match its storage directory.');
    }

    this.getAssetPath(id, template.background.filePath);
    assertValidTemplate(template);
    return template;
  }

  private async writeTemplate(template: Template): Promise<void> {
    const directory = this.getTemplateDirectory(template.id);
    const destination = join(directory, 'template.json');
    const temporary = join(directory, 'template.json.tmp');
    await writeFile(temporary, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    await rename(temporary, destination);
  }

  private getTemplateDirectory(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      throw new Error('Invalid template id.');
    }
    return join(this.templatesRoot, id);
  }

  private getAssetPath(id: string, fileName: string): string {
    if (fileName !== `background${extname(fileName)}`) {
      throw new Error('Invalid background asset path.');
    }
    return join(this.getTemplateDirectory(id), fileName);
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw new Error('Template name is required.');
  }
  if (normalized.length > 120) {
    throw new Error('Template name cannot exceed 120 characters.');
  }
  return normalized;
}

function toSummary(template: Template): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    updatedAt: template.updatedAt,
    width: template.background.width,
    height: template.background.height,
    fieldCount: template.fields.length,
  };
}

function toDataUrl(
  bytes: Uint8Array,
  format: BackgroundFormat | 'png',
): string {
  const mime =
    format === 'svg'
      ? 'image/svg+xml'
      : format === 'jpg'
        ? 'image/jpeg'
        : 'image/png';
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}
