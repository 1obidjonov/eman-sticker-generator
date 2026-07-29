import { extname } from 'node:path';
import {
  dialog,
  ipcMain,
  nativeImage,
  type BrowserWindow,
  type OpenDialogOptions,
} from 'electron';
import {
  IPC_CHANNELS,
  type CreateTemplateInput,
  type RenameTemplateInput,
} from '../../shared/ipc-contract.js';
import type {
  BackgroundFormat,
  Template,
} from '../../shared/types/index.js';
import type { TemplateService } from '../services/TemplateService.js';
import { readSvgDimensions } from '../services/SvgMetadata.js';

export function registerTemplateHandlers(
  templateService: TemplateService,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(IPC_CHANNELS.templates.list, () => templateService.list());

  ipcMain.handle(
    IPC_CHANNELS.templates.create,
    async (_event, input: CreateTemplateInput) => {
      assertCreateInput(input);
      const owner = getWindow();
      const options: OpenDialogOptions = {
        title: 'Выберите фон шаблона',
        properties: ['openFile'],
        filters: [
          {
            name: 'Фон шаблона',
            extensions: ['svg', 'png', 'jpg', 'jpeg'],
          },
        ],
      };
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled || !result.filePaths[0]) {
        return null;
      }

      const sourcePath = result.filePaths[0];
      const format = getBackgroundFormat(sourcePath);
      const assetMetadata =
        format === 'svg'
          ? await inspectSvg(sourcePath)
          : inspectRaster(sourcePath);

      return templateService.create({
        name: input.name,
        sourcePath,
        format,
        width: assetMetadata.width,
        height: assetMetadata.height,
        ...(assetMetadata.thumbnailPng
          ? { thumbnailPng: assetMetadata.thumbnailPng }
          : {}),
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.templates.open, (_event, id: string) =>
    templateService.open(assertId(id)),
  );

  ipcMain.handle(
    IPC_CHANNELS.templates.rename,
    (_event, input: RenameTemplateInput) => {
      if (!input || typeof input.name !== 'string') {
        throw new Error('Invalid rename request.');
      }
      return templateService.rename(assertId(input.id), input.name);
    },
  );

  ipcMain.handle(IPC_CHANNELS.templates.delete, (_event, id: string) =>
    templateService.delete(assertId(id)),
  );

  ipcMain.handle(
    IPC_CHANNELS.templates.save,
    (_event, template: Template) => {
      if (!template || typeof template !== 'object') {
        throw new Error('Invalid template payload.');
      }
      return templateService.save(template);
    },
  );

  ipcMain.handle(IPC_CHANNELS.templates.getBackground, (_event, id: string) =>
    templateService.getBackground(assertId(id)),
  );

  ipcMain.handle(IPC_CHANNELS.templates.getThumbnail, (_event, id: string) =>
    templateService.getThumbnail(assertId(id)),
  );
}

interface InspectedAsset {
  width: number;
  height: number;
  thumbnailPng?: Uint8Array;
}

async function inspectSvg(sourcePath: string): Promise<InspectedAsset> {
  return readSvgDimensions(sourcePath);
}

function inspectRaster(sourcePath: string): InspectedAsset {
  const image = nativeImage.createFromPath(sourcePath);
  const dimensions = image.getSize();
  if (image.isEmpty() || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error('Не удалось определить размер изображения.');
  }
  const thumbnail = image.resize({
    width: Math.min(360, dimensions.width),
    quality: 'good',
  });
  return {
    width: dimensions.width,
    height: dimensions.height,
    thumbnailPng: thumbnail.toPNG(),
  };
}

function assertCreateInput(input: CreateTemplateInput): void {
  if (!input || typeof input.name !== 'string') {
    throw new Error('Invalid create request.');
  }
}

function assertId(id: string): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    throw new Error('Invalid template id.');
  }
  return id;
}

function getBackgroundFormat(path: string): BackgroundFormat {
  const extension = extname(path).toLowerCase();
  if (extension === '.svg') {
    return 'svg';
  }
  if (extension === '.png') {
    return 'png';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'jpg';
  }
  throw new Error('Поддерживаются только SVG, PNG и JPG.');
}
