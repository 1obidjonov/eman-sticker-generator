import {
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type SaveDialogOptions,
} from 'electron';
import {
  BatchExportEngine,
  sanitizeExportBaseName,
} from '../../core/export/index.js';
import type { ParserRegistry } from '../../core/parsers/index.js';
import {
  IPC_CHANNELS,
  type ExportFormat,
  type ExportResult,
  type GenerationBatchExportRequest,
  type GenerationRequest,
} from '../../shared/ipc-contract.js';
import type { GenerationService } from '../services/GenerationService.js';

const ALLOWED_FORMATS = new Set<ExportFormat>(['svg', 'png', 'jpg']);

export function registerGenerationHandlers(
  generationService: GenerationService,
  parserRegistry: ParserRegistry,
  batchExportEngine: BatchExportEngine,
  getWindow: () => BrowserWindow | null,
): () => void {
  const exportedPaths = new Set<string>();

  ipcMain.handle(IPC_CHANNELS.parsers.listAvailable, () =>
    parserRegistry.list(),
  );

  ipcMain.handle(
    IPC_CHANNELS.generation.start,
    (_event, request: GenerationRequest) => {
      assertGenerationRequest(request);
      return generationService.start(request);
    },
  );

  ipcMain.handle(IPC_CHANNELS.generation.cancel, (_event, jobId: string) => {
    generationService.cancel(assertJobId(jobId));
  });

  ipcMain.handle(IPC_CHANNELS.generation.getJob, (_event, jobId: string) =>
    generationService.getJob(assertJobId(jobId)),
  );

  ipcMain.handle(
    IPC_CHANNELS.generation.exportAll,
    async (
      _event,
      request: GenerationBatchExportRequest,
    ): Promise<ExportResult | null> => {
      assertBatchExportRequest(request);
      const stickers = generationService.getCompletedStickers(request.jobId);
      if (stickers.length === 0) {
        throw new Error('Нет готовых наклеек для экспорта.');
      }

      const templateName = sanitizeExportBaseName(
        generationService.getTemplateName(request.jobId),
      );
      const options: SaveDialogOptions = {
        title: 'Экспорт сгенерированных наклеек',
        defaultPath: `${templateName}-${stickers.length}-stickers.zip`,
        filters: [{ name: 'ZIP-архив', extensions: ['zip'] }],
      };
      const owner = getWindow();
      const selected = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (selected.canceled || !selected.filePath) {
        return null;
      }

      const artifact = await batchExportEngine.exportZip({
        outputPath: selected.filePath,
        formats: request.formats,
        scale: request.scale,
        quality: request.quality,
        stickers: stickers.map(({ product, svg }) => ({
          name: product.sku
            ? `${product.sku}-${product.name}`
            : product.name,
          svg,
        })),
      });
      exportedPaths.add(artifact.outputPath);
      return {
        path: artifact.outputPath,
        bytes: artifact.bytes,
        formats: artifact.formats,
        archived: true,
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.generation.reveal, (_event, path: string) => {
    if (typeof path !== 'string' || !exportedPaths.has(path)) {
      throw new Error('Этот путь не относится к пакетному экспорту.');
    }
    shell.showItemInFolder(path);
  });

  const unsubscribeProgress = generationService.onProgress((progress) => {
    getWindow()?.webContents.send(
      IPC_CHANNELS.generation.progress,
      progress,
    );
  });
  const unsubscribeItem = generationService.onItem((item) => {
    getWindow()?.webContents.send(IPC_CHANNELS.generation.item, item);
  });

  return () => {
    unsubscribeProgress();
    unsubscribeItem();
  };
}

function assertGenerationRequest(
  request: GenerationRequest,
): asserts request is GenerationRequest {
  if (!request || typeof request !== 'object') {
    throw new Error('Некорректный запрос генерации.');
  }
  assertTemplateId(request.templateId);
  if (
    !Array.isArray(request.urls) ||
    request.urls.length === 0 ||
    request.urls.length > 1_000 ||
    request.urls.some((url) => typeof url !== 'string' || url.length > 4_096)
  ) {
    throw new Error('Некорректный список ссылок.');
  }
  if (
    request.concurrency !== undefined &&
    (!Number.isInteger(request.concurrency) ||
      request.concurrency < 1 ||
      request.concurrency > 8)
  ) {
    throw new Error('Количество параллельных задач должно быть от 1 до 8.');
  }
}

function assertBatchExportRequest(
  request: GenerationBatchExportRequest,
): void {
  if (!request || typeof request !== 'object') {
    throw new Error('Некорректный запрос пакетного экспорта.');
  }
  assertJobId(request.jobId);
  if (
    !Array.isArray(request.formats) ||
    request.formats.length === 0 ||
    request.formats.some((format) => !ALLOWED_FORMATS.has(format))
  ) {
    throw new Error('Выберите поддерживаемые форматы.');
  }
  if (
    !Number.isInteger(request.scale) ||
    request.scale < 1 ||
    request.scale > 4
  ) {
    throw new Error('Некорректный масштаб экспорта.');
  }
  if (
    !Number.isInteger(request.quality) ||
    request.quality < 1 ||
    request.quality > 100
  ) {
    throw new Error('Некорректное качество JPG.');
  }
}

function assertTemplateId(id: string): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    throw new Error('Некорректный id шаблона.');
  }
  return id;
}

function assertJobId(id: string): string {
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw new Error('Некорректный id задачи.');
  }
  return id;
}
